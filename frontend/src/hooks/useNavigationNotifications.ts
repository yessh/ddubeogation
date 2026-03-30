import { useEffect, useRef } from 'react';
import type { NavigationResponse } from '../types/navigation';
import type { DirectionGuide } from '../api/directions';

const DIR_LABELS: Record<string, string> = {
  straight: '직진',
  turn_right: '우회전',
  turn_left: '좌회전',
  arrive: '목적지 도착',
};

// Announce thresholds in meters before the action
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
  if (!text) return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

// Fallback text when backend guidance is unavailable
function buildFallbackText(
  triggerType: 'new_step' | 'approach_50m' | 'approach_20m',
  step: NavigationResponse['currentStep'],
  currentGuide: DirectionGuide | null,
  nextGuide: DirectionGuide | null,
): string {
  const isTurn = step.direction === 'turn_right' || step.direction === 'turn_left';
  const isCrossing = step.isCrossing;
  const isArrive = step.direction === 'arrive';
  const label = DIR_LABELS[step.direction] ?? step.direction;
  const landmark = isTurn ? (currentGuide?.landmark ?? null) : null;
  const subwayEnter = currentGuide?.subwayEnter ?? null;
  const subwayExit = currentGuide?.subwayExit ?? null;
  const nextIsLeft = nextGuide?.type === 2;
  const nextIsRight = nextGuide?.type === 1;
  const nextIsTurn = nextIsLeft || nextIsRight;
  const nextTurnLabel = nextIsLeft ? '좌회전' : '우회전';
  const shouldAdviseCross = isCrossing && !isTurn && nextIsTurn;

  if (isArrive) return '목적지에 도착했습니다';

  if (triggerType === 'new_step') {
    if (subwayEnter) return `${subwayEnter}으로 들어가세요`;
    if (subwayExit != null) return `${subwayExit}번 출구로 나오세요`;
    if (!isTurn && !isCrossing) return '';

    const distM = Math.round(step.distanceMeters);
    if (isCrossing && isTurn) {
      return landmark
        ? `${distM}미터 앞 ${landmark} 횡단보도에서 ${label}하세요`
        : `${distM}미터 앞 횡단보도에서 ${label}하세요`;
    }
    if (shouldAdviseCross) return `${distM}미터 앞 횡단보도입니다. 이후 ${nextTurnLabel}이 있으니 건너주세요`;
    if (isCrossing) return `${distM}미터 앞 횡단보도입니다`;
    if (landmark) return `${distM}미터 앞 ${landmark}에서 ${label}하세요`;
    return `${distM}미터 앞에서 ${label}하세요`;
  }

  if (triggerType === 'approach_50m') {
    if (isCrossing && isTurn) {
      return landmark
        ? `50미터 앞 ${landmark} 횡단보도에서 ${label}하세요`
        : `50미터 앞 횡단보도에서 ${label}하세요`;
    }
    if (shouldAdviseCross) return `50미터 앞 횡단보도입니다. 이후 ${nextTurnLabel}이 있으니 건너주세요`;
    if (isCrossing) return `50미터 앞 횡단보도입니다`;
    if (landmark) return `50미터 앞 ${landmark}에서 ${label}하세요`;
    return `50미터 앞에서 ${label}하세요`;
  }

  // approach_20m
  if (isCrossing && isTurn) {
    return landmark ? `${landmark} 횡단보도에서 ${label}하세요` : `횡단보도에서 ${label}하세요`;
  }
  if (shouldAdviseCross) return `이후 ${nextTurnLabel}이 있으니 횡단보도를 건너주세요`;
  if (isCrossing) return '횡단보도입니다';
  if (landmark) return `${landmark}에서 ${label}하세요`;
  return `${label}하세요`;
}

export function useNavigationNotifications(
  response: NavigationResponse | null,
  allGuides: DirectionGuide[] = [],
  destAddress: string = '',
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

    const currentGuide = allGuides[step.sequenceIndex] ?? null;
    const nextGuide = allGuides[step.sequenceIndex + 1] ?? null;

    function announce(
      triggerType: 'new_step' | 'approach_50m' | 'approach_20m',
      notifTitle: string,
      notifBody: string,
    ) {
      const guidance = response!.guidance;
      let speechText: string;

      if (triggerType === 'new_step') {
        speechText = guidance.text || buildFallbackText(triggerType, step, currentGuide, nextGuide);
      } else if (triggerType === 'approach_50m') {
        speechText = guidance.shortText
          ? `50미터 앞, ${guidance.shortText}`
          : buildFallbackText(triggerType, step, currentGuide, nextGuide);
      } else {
        // approach_20m
        speechText = guidance.shortText
          ? `곧, ${guidance.shortText}`
          : buildFallbackText(triggerType, step, currentGuide, nextGuide);
      }

      speak(speechText);
      sendNotification(notifTitle, notifBody);
    }

    // ── 1. New step: announce what's coming ──────────────────────────────
    if (step.sequenceIndex !== lastStepIndexRef.current) {
      lastStepIndexRef.current = step.sequenceIndex;
      announcedThresholdsRef.current = new Set();

      if (isArrive) {
        speak('목적지에 도착했습니다');
        sendNotification('🎉 도착', '목적지에 도착했습니다');
        return;
      }

      const hasSubway = currentGuide?.subwayEnter || currentGuide?.subwayExit != null;
      if (isTurn || isCrossing || hasSubway) {
        const distM = Math.round(step.distanceMeters);
        const label = DIR_LABELS[step.direction] ?? step.direction;
        const notifTitle = isCrossing
          ? `🚦 횡단보도 ${isTurn ? label : ''}`.trim()
          : label;
        const notifBody = `${distM}m 앞 ${isCrossing ? '횡단보도' : label}`;
        announce('new_step', notifTitle, notifBody);
      }
      return;
    }

    // ── 2. Distance-based approach warnings ──────────────────────────────
    if (!isTurn && !isCrossing) return;

    const distToEnd = haversine(
      pos.latitude, pos.longitude,
      step.endPoint.latitude, step.endPoint.longitude,
    );

    for (const threshold of THRESHOLDS) {
      if (threshold >= step.distanceMeters * 0.85) continue;
      if (distToEnd > threshold) continue;
      if (announcedThresholdsRef.current.has(threshold)) continue;

      announcedThresholdsRef.current.add(threshold);

      const label = DIR_LABELS[step.direction] ?? step.direction;
      const triggerType = threshold === 20 ? 'approach_20m' as const : 'approach_50m' as const;
      const notifTitle = isCrossing ? '🚦 횡단보도' : `${label} 접근`;
      const notifBody = threshold === 20
        ? `곧 ${isCrossing ? '횡단보도' : label}`
        : `${threshold}m 앞 ${isCrossing ? '횡단보도' : label}`;

      announce(triggerType, notifTitle, notifBody);
      break;
    }
  }, [response]);

  // Suppress unused variable warning — destAddress is passed for potential future use
  void destAddress;
}
