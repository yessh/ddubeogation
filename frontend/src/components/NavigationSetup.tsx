import React, { useState } from 'react';
import type { SessionStatus } from '../types/navigation';

interface Props {
  sessionId: string;
  setSessionId: (v: string) => void;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  setOriginLat: (v: number) => void;
  setOriginLon: (v: number) => void;
  setDestLat: (v: number) => void;
  setDestLon: (v: number) => void;
  status: SessionStatus;
  onStart: () => Promise<void>;
  onEnd: () => Promise<void>;
}

const statusLabel: Record<SessionStatus, string> = {
  idle: '대기',
  active: '진행 중',
  arrived: '도착',
  error: '오류',
};
const statusColor: Record<SessionStatus, string> = {
  idle: 'bg-gray-400',
  active: 'bg-green-500',
  arrived: 'bg-blue-500',
  error: 'bg-red-500',
};

export const NavigationSetup = React.memo(function NavigationSetup({
  sessionId, setSessionId,
  originLat, originLon, destLat, destLon,
  setOriginLat, setOriginLon, setDestLat, setDestLon,
  status, onStart, onEnd,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try { await onStart(); } finally { setLoading(false); }
  };
  const handleEnd = async () => {
    setLoading(true);
    try { await onEnd(); } finally { setLoading(false); }
  };

  const isActive = status === 'active' || status === 'arrived';

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-sm">세션 설정</h2>
        <span className={`px-2 py-0.5 rounded-full text-xs text-white font-medium ${statusColor[status]}`}>
          {statusLabel[status]}
        </span>
      </div>

      {/* Session ID */}
      <div className="space-y-1">
        <label className="text-gray-400 text-xs">세션 ID</label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1.5 font-mono"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={isActive}
          />
          <button
            className="bg-gray-600 hover:bg-gray-500 text-white text-xs rounded px-2 py-1.5 whitespace-nowrap"
            onClick={() => setSessionId(crypto.randomUUID())}
            disabled={isActive}
          >
            생성
          </button>
        </div>
      </div>

      {/* Origin */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">출발 위도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5"
            value={originLat}
            onChange={(e) => setOriginLat(Number(e.target.value))}
            disabled={isActive}
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">출발 경도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5"
            value={originLon}
            onChange={(e) => setOriginLon(Number(e.target.value))}
            disabled={isActive}
          />
        </div>
      </div>

      {/* Destination */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">목적지 위도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5"
            value={destLat}
            onChange={(e) => setDestLat(Number(e.target.value))}
            disabled={isActive}
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-400 text-xs">목적지 경도</label>
          <input
            type="number" step="0.000001"
            className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5"
            value={destLon}
            onChange={(e) => setDestLon(Number(e.target.value))}
            disabled={isActive}
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        {!isActive ? (
          <button
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded py-2"
            onClick={handleStart}
            disabled={loading || !sessionId}
          >
            {loading ? '시작 중...' : '네비게이션 시작'}
          </button>
        ) : (
          <button
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded py-2"
            onClick={handleEnd}
            disabled={loading}
          >
            {loading ? '종료 중...' : '세션 종료'}
          </button>
        )}
      </div>
    </div>
  );
});
