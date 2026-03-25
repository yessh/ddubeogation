import { useState, useRef, useEffect, useCallback } from 'react';
import { getAudioVector } from '../api/navigation';
import type { AudioVectorResponse, LogEntry } from '../types/navigation';

let logIdCounter = 0;

interface UseAudioPollingResult {
  audioVector: AudioVectorResponse | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  log: LogEntry[];
}

export function useAudioPolling(
  userBearing: number,
  targetBearing: number,
  noiseDb: number,
  enabled: boolean
): UseAudioPollingResult {
  const [audioVector, setAudioVector] = useState<AudioVectorResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const paramsRef = useRef({ userBearing, targetBearing, noiseDb });
  useEffect(() => {
    paramsRef.current = { userBearing, targetBearing, noiseDb };
  });

  const startPolling = useCallback(() => setIsPolling(true), []);
  const stopPolling = useCallback(() => setIsPolling(false), []);

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    setLog((prev) => [{ ...entry, id: ++logIdCounter }, ...prev].slice(0, 5));
  }, []);

  useEffect(() => {
    if (!isPolling || !enabled) return;

    let abortController: AbortController | null = null;

    const id = setInterval(async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const t0 = performance.now();
      const { userBearing: ub, targetBearing: tb, noiseDb: nd } = paramsRef.current;
      try {
        const res = await getAudioVector(ub, tb, nd, abortController.signal);
        const durationMs = Math.round(performance.now() - t0);
        setAudioVector(res);
        addLog({ timestamp: Date.now(), type: 'audio-vector', durationMs, status: 200 });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const durationMs = Math.round(performance.now() - t0);
        addLog({
          timestamp: Date.now(),
          type: 'audio-vector',
          durationMs,
          status: 500,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 20);

    return () => {
      clearInterval(id);
      abortController?.abort();
    };
  }, [isPolling, enabled, addLog]);

  return { audioVector, isPolling, startPolling, stopPolling, log };
}
