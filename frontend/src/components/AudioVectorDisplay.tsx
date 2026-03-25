import React from 'react';
import type { AudioVectorResponse } from '../types/navigation';

interface Props {
  audioVector: AudioVectorResponse | null;
  navAudio?: { pitchHz: number; stereoPan: number; volumeMultiplier: number; hapticIntensity: number; thetaDegrees: number; beepPattern: string; voiceEnabled: boolean; hapticOnly: boolean } | null;
}

function thetaColor(theta: number): string {
  const abs = Math.abs(theta);
  if (abs <= 15) return '#22c55e';
  if (abs <= 45) return '#eab308';
  if (abs <= 90) return '#f97316';
  return '#ef4444';
}

const BEEP_PATTERNS = ['none', 'single', 'double', 'triple', 'continuous'];

function Compass({ theta }: { theta: number }) {
  const color = thetaColor(theta);
  const rad = ((theta - 90) * Math.PI) / 180;
  const cx = 60, cy = 60, r = 48;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);

  return (
    <svg width="120" height="120" className="block mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="2" />
      {/* Cardinal marks */}
      {[0, 90, 180, 270].map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        return (
          <line key={deg}
            x1={cx + (r - 8) * Math.cos(a)} y1={cy + (r - 8) * Math.sin(a)}
            x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
            stroke="#6b7280" strokeWidth="2"
          />
        );
      })}
      {/* Pointer */}
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx={x} cy={y} r={5} fill={color} />
      <circle cx={cx} cy={cy} r={4} fill="#9ca3af" />
      {/* Center label */}
      <text x={cx} y={cy - 52} textAnchor="middle" fill="#6b7280" fontSize="10">북</text>
    </svg>
  );
}

function PitchBar({ pitchHz }: { pitchHz: number }) {
  const pct = ((pitchHz - 300) / 300) * 100;
  const color = thetaColor((pct / 100) * 180 - 90); // reuse for visual continuity

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-gray-400 text-xs">Pitch</span>
      <div className="relative w-6 h-24 bg-gray-700 rounded-full overflow-hidden flex items-end">
        <div className="w-full rounded-full transition-all" style={{ height: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-white text-xs font-mono">{Math.round(pitchHz)}Hz</span>
    </div>
  );
}

function PanMeter({ pan }: { pan: number }) {
  const pct = ((pan + 1) / 2) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>L</span><span>Pan</span><span>R</span>
      </div>
      <div className="relative h-3 bg-gray-700 rounded-full">
        <div className="absolute top-0 bottom-0 w-px bg-gray-500" style={{ left: '50%' }} />
        <div
          className="absolute top-0.5 bottom-0.5 w-3 bg-blue-400 rounded-full transition-all"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="text-center text-xs text-gray-400 font-mono">{pan.toFixed(2)}</div>
    </div>
  );
}

export const AudioVectorDisplay = React.memo(function AudioVectorDisplay({ audioVector, navAudio }: Props) {
  const data = audioVector ?? navAudio;

  if (!data) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-center h-40">
        <p className="text-gray-500 text-sm">오디오 폴링 시작 후 표시됩니다</p>
      </div>
    );
  }

  const dirHint = (audioVector as AudioVectorResponse | null)?.directionHint ?? '';

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="text-white font-bold text-sm">오디오 벡터</h2>

      <div className="flex items-center gap-4">
        <Compass theta={data.thetaDegrees} />
        <div className="flex-1 space-y-3">
          {dirHint && (
            <p className="text-2xl font-bold text-center" style={{ fontFamily: "'Noto Sans KR', sans-serif", color: thetaColor(data.thetaDegrees) }}>
              {dirHint}
            </p>
          )}
          <PanMeter pan={data.stereoPan} />

          {/* Haptic bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>햅틱</span><span>{data.hapticIntensity}/255</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${(data.hapticIntensity / 255) * 100}%` }} />
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>볼륨</span><span>{Math.round(data.volumeMultiplier * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${data.volumeMultiplier * 100}%` }} />
            </div>
          </div>
        </div>
        <PitchBar pitchHz={data.pitchHz} />
      </div>

      {/* Beep patterns */}
      <div className="flex gap-1">
        {BEEP_PATTERNS.map((p) => (
          <div key={p} className={`flex-1 text-center py-1 rounded text-xs font-medium transition-colors ${
            data.beepPattern === p ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
          }`}>
            {p === 'none' ? 'NONE' : p === 'single' ? '1x' : p === 'double' ? '2x' : p === 'triple' ? '3x' : 'CON'}
          </div>
        ))}
      </div>

      {/* Mode badges */}
      <div className="flex gap-2">
        <span className={`px-2 py-1 rounded text-xs font-bold ${data.voiceEnabled ? 'bg-green-700 text-green-200' : 'bg-gray-700 text-gray-500'}`}>
          VOICE {data.voiceEnabled ? 'ON' : 'OFF'}
        </span>
        <span className={`px-2 py-1 rounded text-xs font-bold ${data.hapticOnly ? 'bg-red-700 text-red-200' : 'bg-gray-700 text-gray-500'}`}>
          HAPTIC-ONLY {data.hapticOnly ? 'ON' : 'OFF'}
        </span>
        <span className="ml-auto text-xs text-gray-400 font-mono">θ={data.thetaDegrees.toFixed(1)}°</span>
      </div>
    </div>
  );
});
