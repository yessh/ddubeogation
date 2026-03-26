import type {
  StartRequest,
  NavigationRequest,
  NavigationResponse,
} from '../types/navigation';

const BASE = '/api/v1';

export async function startNavigation(req: StartRequest): Promise<string> {
  const res = await fetch(`${BASE}/navigation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Start failed: ${res.status}`);
  return res.text();
}

export async function updateNavigation(
  req: NavigationRequest,
  signal?: AbortSignal
): Promise<NavigationResponse> {
  const res = await fetch(`${BASE}/navigation/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return res.json() as Promise<NavigationResponse>;
}

export async function endNavigation(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/navigation/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) throw new Error(`End failed: ${res.status}`);
}
