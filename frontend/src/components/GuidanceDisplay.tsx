import React from 'react';
import type { NavigationResponse } from '../types/navigation';

interface Props {
  response: NavigationResponse | null;
  noiseDb: number;
}

const directionIcon: Record<string, string> = {
  straight: '↑',
  turn_right: '↱',
  turn_left: '↰',
  arrive: '⭐',
};

function getAdaptiveText(response: NavigationResponse, noiseDb: number): { text: string; label: string } {
  if (!response.guidance) return { text: '—', label: '' };
  if (noiseDb >= 85) return { text: '🔇 햅틱 전용', label: 'HAPTIC ONLY' };
  if (noiseDb >= 75) return { text: response.guidance.shortText || response.guidance.text, label: '짧은 TTS' };
  return { text: response.guidance.text, label: '음성 안내' };
}

export const GuidanceDisplay = React.memo(function GuidanceDisplay({ response, noiseDb }: Props) {
  if (!response) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-center h-40">
        <p className="text-gray-500 text-sm">네비게이션 시작 후 가이던스가 표시됩니다</p>
      </div>
    );
  }

  const { text, label } = getAdaptiveText(response, noiseDb);
  const step = response.currentStep;
  const dist = Math.round(response.distanceToDestination);

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      {response.arrived && (
        <div className="bg-blue-600 rounded-lg px-4 py-2 text-center text-white font-bold text-lg animate-pulse">
          🎉 목적지 도착!
        </div>
      )}

      {/* Main guidance text */}
      <div className="bg-gray-700 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{label}</span>
          {response.guidance?.fromCache ? (
            <span className="px-1.5 py-0.5 bg-green-800 text-green-300 text-xs rounded">CACHED</span>
          ) : (
            <span className="px-1.5 py-0.5 bg-gray-600 text-gray-300 text-xs rounded">LIVE</span>
          )}
        </div>
        <p className="text-white text-2xl font-bold" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
          {text}
        </p>
      </div>

      {/* Current step */}
      {step && (
        <div className="flex items-center gap-3 bg-gray-700 rounded-lg px-3 py-2">
          <span className="text-3xl">{directionIcon[step.direction] ?? '?'}</span>
          <div>
            <p className="text-white text-sm font-medium">
              {step.streetName || step.direction}
              {step.isCrossing && <span className="ml-1 text-yellow-400 text-xs">(횡단보도)</span>}
            </p>
            <p className="text-gray-400 text-xs">구간 {Math.round(step.distanceMeters)}m</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-white font-bold text-lg">{dist}m</p>
            <p className="text-gray-400 text-xs">목적지까지</p>
          </div>
        </div>
      )}

      {/* Debug: corrected position */}
      {response.correctedPosition && (
        <div className="text-gray-600 text-xs font-mono">
          Kalman: {response.correctedPosition.latitude.toFixed(6)}, {response.correctedPosition.longitude.toFixed(6)}
        </div>
      )}
    </div>
  );
});
