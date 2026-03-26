import { useEffect, useRef } from 'react';
import type { NavigationResponse } from '../types/navigation';

const DIR_LABELS: Record<string, string> = {
  straight: '직진',
  turn_right: '우회전',
  turn_left: '좌회전',
  arrive: '목적지 도착',
};

// Announce thresholds in meters before the action
const THRESHOLDS = [100, 50, 20];

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

export function useNavigationNotifications(response: NavigationResponse | null) {
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

    // ── 1. New step: announce what's coming ──────────────────────────────
    if (step.sequenceIndex !== lastStepIndexRef.current) {
      lastStepIndexRef.current = step.sequenceIndex;
      announcedThresholdsRef.current = new Set();

      if (isArrive) {
        speak('목적지에 도착했습니다');
        sendNotification('🎉 도착', '목적지에 도착했습니다');
        return;
      }

      if (isTurn || isCrossing) {
        const distM = Math.round(step.distanceMeters);
        const speechText = isCrossing && isTurn
          ? `${distM}미터 앞 횡단보도에서 ${label}하세요`
          : isCrossing
          ? `${distM}미터 앞 횡단보도입니다`
          : `${distM}미터 앞에서 ${label}하세요`;

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
        speechText = isCrossing && isTurn
          ? `횡단보도에서 ${label}하세요`
          : isCrossing
          ? '횡단보도입니다'
          : `${label}하세요`;
        notifTitle = isCrossing ? '🚦 횡단보도' : label;
        notifBody = `곧 ${isCrossing ? '횡단보도' : label}`;
      } else {
        speechText = isCrossing && isTurn
          ? `${threshold}미터 앞 횡단보도에서 ${label}하세요`
          : isCrossing
          ? `${threshold}미터 앞 횡단보도입니다`
          : `${threshold}미터 앞에서 ${label}하세요`;
        notifTitle = isCrossing ? '🚦 횡단보도 접근' : `${label} 접근`;
        notifBody = `${threshold}m 앞 ${isCrossing ? '횡단보도' : label}`;
      }

      speak(speechText);
      sendNotification(notifTitle, notifBody);
      break; // announce only one threshold per update tick
    }
  }, [response]);
}
