import { useEffect, useRef } from 'react';
import type { NavigationResponse } from '../types/navigation';
import type { DirectionGuide } from '../api/directions';

const DIR_LABELS: Record<string, string> = {
  straight: '직진',
  turn_right: '우회전',
  turn_left: '좌회전',
  arrive: '목적지 도착',
};

// Announce thresholds in meters before the action (100m omitted — too early for pedestrians)
const THRESHOLDS = [50, 20];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag: 'navigation', silent: false });
  }
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function useNavigationNotifications(
  response: NavigationResponse | null,
  allGuides: DirectionGuide[] = [],
) {
  const lastStepIndexRef = useRef<number>(-1);
  const announcedThresholdsRef = useRef<Set<number>>(new Set());

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!response?.currentStep || !response.correctedPosition) return;

    const step = response.currentStep;
    const pos = response.correctedPosition;
    const isTurn = step.direction === 'turn_right' || step.direction === 'turn_left';
    const isCrossing = step.isCrossing;
    const isArrive = step.direction === 'arrive';
    const label = DIR_LABELS[step.direction] ?? step.direction;

    // Current guide: look up landmark, subway info, and next guide (for crosswalk advice)
    const currentGuide = allGuides[step.sequenceIndex];
    const landmark = isTurn ? (currentGuide?.landmark ?? null) : null;
    const subwayEnter = currentGuide?.subwayEnter ?? null;
    const subwayExit = currentGuide?.subwayExit ?? null;

    // Look ahead: if this is a straight crossing, check if the next guide step is a turn.
    // GPS cannot determine which side of the road the user is on, so we advise crossing
    // early when a turn is coming up after the crosswalk.
    const nextGuide = allGuides[step.sequenceIndex + 1];
    const nextIsLeft = nextGuide?.type === 2;
    const nextIsRight = nextGuide?.type === 1;
    const nextIsTurn = nextIsLeft || nextIsRight;
    const nextTurnLabel = nextIsLeft ? '좌회전' : '우회전';
    // Only advise crossing when current step is a straight crossing (not already a combined turn+crossing)
    const shouldAdviseCross = isCrossing && !isTurn && nextIsTurn;

    // ── 1. New step: announce what's coming ──────────────────────────────
    if (step.sequenceIndex !== lastStepIndexRef.current) {
      lastStepIndexRef.current = step.sequenceIndex;
      announcedThresholdsRef.current = new Set();

      if (isArrive) {
        speak('목적지에 도착했습니다');
        sendNotification('🎉 도착', '목적지에 도착했습니다');
        return;
      }

      // ── Subway entry / exit announcements ────────────────────────────────
      if (subwayEnter) {
        speak(`${subwayEnter}으로 들어가세요`);
        sendNotification('🚇 지하철역', `${subwayEnter}으로 들어가세요`);
        return;
      }
      if (subwayExit !== null) {
        speak(`${subwayExit}번 출구로 나오세요`);
        sendNotification('🚇 출구', `${subwayExit}번 출구로 나오세요`);
        return;
      }

      if (isTurn || isCrossing) {
        const distM = Math.round(step.distanceMeters);
        let speechText: string;
        if (isCrossing && isTurn) {
          speechText = landmark
            ? `${distM}미터 앞 ${landmark} 횡단보도에서 ${label}하세요`
            : `${distM}미터 앞 횡단보도에서 ${label}하세요`;
        } else if (shouldAdviseCross) {
          speechText = `${distM}미터 앞 횡단보도입니다. 이후 ${nextTurnLabel}이 있으니 건너주세요`;
        } else if (isCrossing) {
          speechText = `${distM}미터 앞 횡단보도입니다`;
        } else if (landmark) {
          speechText = `${distM}미터 앞 ${landmark}에서 ${label}하세요`;
        } else {
          speechText = `${distM}미터 앞에서 ${label}하세요`;
        }

        speak(speechText);
        sendNotification(
          isCrossing ? `🚦 횡단보도 ${isTurn ? label : ''}` : label,
          `${distM}m 앞 ${isCrossing ? '횡단보도' : label}`
        );
      }
      return;
    }

    // ── 2. Distance-based approach warnings ──────────────────────────────
    if (!isTurn && !isCrossing) return;

    const distToEnd = haversine(
      pos.latitude,
      pos.longitude,
      step.endPoint.latitude,
      step.endPoint.longitude
    );

    for (const threshold of THRESHOLDS) {
      // Skip thresholds larger than the step itself (avoid double-announcing)
      if (threshold >= step.distanceMeters * 0.85) continue;
      if (distToEnd > threshold) continue;
      if (announcedThresholdsRef.current.has(threshold)) continue;

      announcedThresholdsRef.current.add(threshold);

      let speechText: string;
      let notifTitle: string;
      let notifBody: string;

      if (threshold === 20) {
        // Immediate: "곧"
        if (isCrossing && isTurn) {
          speechText = landmark
            ? `${landmark} 횡단보도에서 ${label}하세요`
            : `횡단보도에서 ${label}하세요`;
        } else if (shouldAdviseCross) {
          speechText = `이후 ${nextTurnLabel}이 있으니 횡단보도를 건너주세요`;
        } else if (isCrossing) {
          speechText = '횡단보도입니다';
        } else if (landmark) {
          speechText = `${landmark}에서 ${label}하세요`;
        } else {
          speechText = `${label}하세요`;
        }
        notifTitle = isCrossing ? '🚦 횡단보도' : label;
        notifBody = `곧 ${isCrossing ? '횡단보도' : label}`;
      } else {
        if (isCrossing && isTurn) {
          speechText = landmark
            ? `${threshold}미터 앞 ${landmark} 횡단보도에서 ${label}하세요`
            : `${threshold}미터 앞 횡단보도에서 ${label}하세요`;
        } else if (shouldAdviseCross) {
          speechText = `${threshold}미터 앞 횡단보도입니다. 이후 ${nextTurnLabel}이 있으니 건너주세요`;
        } else if (isCrossing) {
          speechText = `${threshold}미터 앞 횡단보도입니다`;
        } else if (landmark) {
          speechText = `${threshold}미터 앞 ${landmark}에서 ${label}하세요`;
        } else {
          speechText = `${threshold}미터 앞에서 ${label}하세요`;
        }
        notifTitle = isCrossing ? '🚦 횡단보도 접근' : `${label} 접근`;
        notifBody = `${threshold}m 앞 ${isCrossing ? '횡단보도' : label}`;
      }

      speak(speechText);
      sendNotification(notifTitle, notifBody);
      break; // announce only one threshold per update tick
    }
  }, [response]);
}
