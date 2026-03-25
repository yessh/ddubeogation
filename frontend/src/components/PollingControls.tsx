import React from 'react';
import type { LogEntry } from '../types/navigation';

interface Props {
  isNavPolling: boolean;
  isAudioPolling: boolean;
  onToggleNav: () => void;
  onToggleAudio: () => void;
  navEnabled: boolean;
  log: LogEntry[];
}

const typeLabel: Record<LogEntry['type'], string> = {
  'nav-update': 'NAV',
  'audio-vector': 'AUD',
  start: 'START',
  end: 'END',
};

const typeColor: Record<LogEntry['type'], string> = {
  'nav-update': 'text-blue-400',
  'audio-vector': 'text-purple-400',
  start: 'text-green-400',
  end: 'text-red-400',
};

export const PollingControls = React.memo(function PollingControls({
  isNavPolling, isAudioPolling, onToggleNav, onToggleAudio, navEnabled, log,
}: Props) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="text-white font-bold text-sm">폴링 제어</h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          className={`rounded-lg py-2 text-sm font-medium transition-colors ${
            isNavPolling
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          } disabled:opacity-40`}
          onClick={onToggleNav}
          disabled={!navEnabled}
        >
          {isNavPolling ? '⏹ NAV 중지' : '▶ NAV 시작'}
          <span className="block text-xs opacity-70">50ms / 20Hz</span>
        </button>

        <button
          className={`rounded-lg py-2 text-sm font-medium transition-colors ${
            isAudioPolling
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
          onClick={onToggleAudio}
        >
          {isAudioPolling ? '⏹ AUDIO 중지' : '▶ AUDIO 시작'}
          <span className="block text-xs opacity-70">20ms / 50Hz</span>
        </button>
      </div>

      {/* Log table */}
      {log.length > 0 && (
        <div className="space-y-1">
          <p className="text-gray-500 text-xs">최근 요청</p>
          <div className="space-y-0.5">
            {log.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs font-mono bg-gray-700 rounded px-2 py-1">
                <span className={`w-10 font-bold ${typeColor[entry.type]}`}>{typeLabel[entry.type]}</span>
                <span className={`w-14 text-right ${entry.durationMs > 100 ? 'text-red-400' : 'text-gray-300'}`}>
                  {entry.durationMs}ms
                </span>
                <span className={`w-8 ${entry.status === 200 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.status}
                </span>
                {entry.error && (
                  <span className="text-red-400 truncate">{entry.error}</span>
                )}
                <span className="ml-auto text-gray-600">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
