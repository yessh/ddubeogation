import React from 'react';
import type { SimState } from '../types/navigation';

interface Props {
  simState: SimState;
  setSimState: React.Dispatch<React.SetStateAction<SimState>>;
  disabled?: boolean;
}

function hdopColor(hdop: number): string {
  if (hdop < 2) return 'text-green-400';
  if (hdop < 4) return 'text-yellow-400';
  return 'text-red-400';
}

function hdopLabel(hdop: number): string {
  if (hdop < 2) return '우수';
  if (hdop < 4) return '보통';
  return '불량';
}

function noiseLabel(db: number): string {
  if (db >= 85) return '햅틱 전용';
  if (db >= 75) return '짧은 TTS';
  if (db >= 60) return '음성+볼륨업';
  return '음성 안내';
}

function noiseColor(db: number): string {
  if (db >= 85) return 'text-red-400';
  if (db >= 75) return 'text-orange-400';
  if (db >= 60) return 'text-yellow-400';
  return 'text-green-400';
}

function Slider({ label, value, min, max, step = 1, onChange, unit = '', colorClass = '' }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string; colorClass?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-gray-400 text-xs">{label}</label>
        <span className={`text-xs font-mono font-medium ${colorClass || 'text-white'}`}>
          {value.toFixed(step < 1 ? 1 : 0)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-gray-600 accent-blue-500"
      />
    </div>
  );
}

export const GpsSimulator = React.memo(function GpsSimulator({ simState, setSimState, disabled }: Props) {
  const set = <K extends keyof SimState>(key: K, value: SimState[K]) =>
    setSimState((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="text-white font-bold text-sm">GPS / IMU 시뮬레이터</h2>

      {/* Lat/Lon */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">위도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 font-mono"
            value={simState.lat}
            onChange={(e) => set('lat', Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">경도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 font-mono"
            value={simState.lon}
            onChange={(e) => set('lon', Number(e.target.value))}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Sliders */}
      <Slider label="고도 (m)" value={simState.altitude} min={0} max={500} step={1}
        onChange={(v) => set('altitude', v)} unit="m" />

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-gray-400 text-xs">HDOP</label>
          <span className={`text-xs font-mono font-medium ${hdopColor(simState.hdop)}`}>
            {simState.hdop.toFixed(1)} ({hdopLabel(simState.hdop)})
          </span>
        </div>
        <input
          type="range" min={0.5} max={10} step={0.1} value={simState.hdop}
          onChange={(e) => set('hdop', Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-gray-600 accent-blue-500"
        />
        <div className="flex justify-between text-gray-600 text-xs">
          <span>0.5 우수</span><span>4.0</span><span>10 불량</span>
        </div>
      </div>

      <Slider label="베어링 (°)" value={simState.bearing} min={0} max={359} step={1}
        onChange={(v) => set('bearing', v)} unit="°" />

      <Slider label="머리 방향 (°)" value={simState.headBearing} min={0} max={359} step={1}
        onChange={(v) => set('headBearing', v)} unit="°" />

      {/* Noise slider with threshold markers */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label className="text-gray-400 text-xs">주변 소음</label>
          <span className={`text-xs font-medium ${noiseColor(simState.ambientNoiseDb)}`}>
            {simState.ambientNoiseDb}dB · {noiseLabel(simState.ambientNoiseDb)}
          </span>
        </div>
        <input
          type="range" min={30} max={100} step={1} value={simState.ambientNoiseDb}
          onChange={(e) => set('ambientNoiseDb', Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-gray-600 accent-blue-500"
        />
        <div className="flex justify-between text-gray-600 text-xs">
          <span>30</span><span className="text-yellow-700">60</span>
          <span className="text-orange-700">75</span>
          <span className="text-red-700">85</span><span>100</span>
        </div>
      </div>

      {/* Simulate Walk toggle */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-white text-sm">도보 시뮬레이션</span>
        <button
          className={`w-12 h-6 rounded-full transition-colors relative ${simState.simulateWalk ? 'bg-blue-600' : 'bg-gray-600'}`}
          onClick={() => set('simulateWalk', !simState.simulateWalk)}
          disabled={disabled}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${simState.simulateWalk ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {simState.simulateWalk && (
        <p className="text-xs text-blue-400">목적지 방향으로 자동 이동 중...</p>
      )}
    </div>
  );
});
