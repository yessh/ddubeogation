import { useState, useRef, useEffect, useCallback } from 'react';
import { updateNavigation } from '../api/navigation';
import type { NavigationRequest, NavigationResponse, LogEntry } from '../types/navigation';

let logIdCounter = 0;

interface UseNavigationSessionResult {
  lastResponse: NavigationResponse | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  log: LogEntry[];
  addLog: (entry: Omit<LogEntry, 'id'>) => void;
}

export function useNavigationSession(
  sessionId: string,
  getRequest: () => NavigationRequest,
  enabled: boolean
): UseNavigationSessionResult {
  const [lastResponse, setLastResponse] = useState<NavigationResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const getRequestRef = useRef(getRequest);
  const stopPollingRef = useRef<() => void>(() => {});

  // Keep the getter ref fresh on every render
  useEffect(() => {
    getRequestRef.current = getRequest;
  });

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    setLog((prev) => [{ ...entry, id: ++logIdCounter }, ...prev].slice(0, 5));
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  // Keep stopPollingRef current
  useEffect(() => {
    stopPollingRef.current = stopPolling;
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    if (!sessionId) return;
    setIsPolling(true);
  }, [sessionId]);

  useEffect(() => {
    if (!isPolling || !sessionId || !enabled) return;

    let abortController: AbortController | null = null;

    const id = setInterval(async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const t0 = performance.now();
      try {
        const req = getRequestRef.current();
        const res = await updateNavigation(req, abortController.signal);
        const durationMs = Math.round(performance.now() - t0);

        setLastResponse(res);
        addLog({ timestamp: Date.now(), type: 'nav-update', durationMs, status: 200 });

        if (res.arrived) {
          stopPollingRef.current();
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const durationMs = Math.round(performance.now() - t0);
        addLog({
          timestamp: Date.now(),
          type: 'nav-update',
          durationMs,
          status: 500,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 50);

    return () => {
      clearInterval(id);
      abortController?.abort();
    };
  }, [isPolling, sessionId, enabled, addLog]);

  return { lastResponse, isPolling, startPolling, stopPolling, log, addLog };
}
