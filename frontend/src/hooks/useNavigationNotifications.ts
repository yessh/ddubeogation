import { useEffect, useRef } from 'react';
import type { NavigationResponse } from '../types/navigation';

const DIR_LABELS: Record<string, string> = {
  straight: '직진',
  turn_right: '우회전',
  turn_left: '좌회전',
  arrive: '목적지 도착',
};

export function useNavigationNotifications(response: NavigationResponse | null) {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!response?.currentStep) return;

    const step = response.currentStep;
    const key = `${step.direction}:${step.sequenceIndex}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const label = DIR_LABELS[step.direction] ?? step.direction;
    const distM = Math.round(step.distanceMeters);
    const remaining = Math.round(response.distanceToDestination);
    const isArrive = step.direction === 'arrive';

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(label, {
        body: isArrive
          ? '목적지에 도착했습니다'
          : `${distM}m 후 ${label} · 목적지까지 ${remaining}m`,
        tag: 'navigation',
        silent: false,
      });
    }

    // TTS (Korean)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = isArrive
        ? '목적지에 도착했습니다'
        : `${distM}미터 앞에서 ${label}하세요`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [response?.currentStep?.sequenceIndex, response?.currentStep?.direction]);
}
