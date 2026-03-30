const WALKING_SPEED_MPS = 4000 / 3600;

export interface DirectionGuide {
  x: number; // longitude
  y: number; // latitude
  distance: number;
  type: number;
  guidance: string;
  name: string;
  landmark?: string;   // nearby POI name for landmark-based turn guidance
  subwayEnter?: string; // station name when route enters underground (TMAP only)
  subwayExit?: number;  // exit number when route exits underground (TMAP only)
}

export interface DirectionResult {
  vertexes: number[]; // flat array: [lon, lat, lon, lat, ...]
  guides: DirectionGuide[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

// ── TMAP 보행자 ──────────────────────────────────────────────────────────────

const TMAP_KEY = import.meta.env.VITE_TMAP_KEY as string | undefined;
const TMAP_BASE = import.meta.env.DEV
  ? '/tmap/tmap/routes/pedestrian'
  : 'https://apis.openapi.sk.com/tmap/routes/pedestrian';

/** TMAP turnType → DirectionGuide type code (0=직진, 1=우, 2=좌, 3=도착) */
function tmapTurnCode(turnType: number): number {
  if (turnType === 125) return 3;                         // 도착
  if (turnType === 12 || turnType === 16 || turnType === 18) return 2; // 좌측 계열
  if (turnType === 13 || turnType === 17 || turnType === 19) return 1; // 우측 계열
  return 0;                                               // 직진, 출발, 유턴 등
}

type TmapFeature = {
  type: 'Feature';
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: {
    pointType?: 'SP' | 'EP' | 'GP';
    turnType?: number;
    description?: string;
    streetName?: string;
    distance?: number;
    totalDistance?: number;
    totalTime?: number;
  };
};

async function fetchRouteTmap(
  originLat: number, originLon: number,
  destLat: number, destLon: number
): Promise<DirectionResult | null> {
  if (!TMAP_KEY) return null;

  const tmapUrl = `${TMAP_BASE}?version=1&appKey=${TMAP_KEY}`;
  const res = await fetch(tmapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startX: String(originLon),
      startY: String(originLat),
      endX: String(destLon),
      endY: String(destLat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: '출발지',
      endName: '목적지',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[Directions] TMAP error:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { features?: TmapFeature[] };
  console.log('[Directions] TMAP 응답 features 수:', data.features?.length ?? 0);
  if (!data.features?.length) return null;

  const vertexes: number[] = [];
  const guides: DirectionGuide[] = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  for (const f of data.features) {
    if (f.geometry.type === 'LineString') {
      for (const [lon, lat] of f.geometry.coordinates) vertexes.push(lon, lat);
    } else {
      // Point feature
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;

      if (p.pointType === 'SP') {
        totalDistanceMeters = p.totalDistance ?? 0;
        totalDurationSeconds = p.totalTime ?? 0;
      }

      // SP/GP/EP 모두 안내 포인트로 추가
      const description = p.description ?? '';
      const streetName = p.streetName ?? '';

      // Detect subway exit number (e.g. "8번출구", "8번 출구")
      const exitMatch = description.match(/(\d+)\s*번\s*출구/);
      const subwayExit = exitMatch ? parseInt(exitMatch[1]) : undefined;

      guides.push({
        x: lon, y: lat,
        distance: p.distance ?? 0,
        type: tmapTurnCode(p.turnType ?? 11),
        guidance: description,
        name: streetName,
        ...(subwayExit !== undefined ? { subwayExit } : {}),
      });
    }
  }

  if (vertexes.length < 4) return null;

  // Post-process: mark the first guide in each underground sequence as a subway entry.
  // TMAP uses streetNames like "○○역 지하통로" or "지하보도" for underground segments.
  const UNDERGROUND_KEYWORDS = ['지하통로', '지하역사', '지하보도', '지하상가통로'];
  for (let i = 0; i < guides.length; i++) {
    const curr = guides[i];
    if (curr.subwayExit) continue; // exit points are already flagged
    const currIsUnder = UNDERGROUND_KEYWORDS.some((kw) => curr.name.includes(kw));
    if (!currIsUnder) continue;
    const prev = guides[i - 1];
    const prevIsUnder = prev
      ? (UNDERGROUND_KEYWORDS.some((kw) => prev.name.includes(kw)) || !!prev.subwayEnter)
      : false;
    if (!prevIsUnder) {
      // Extract station name from streetName (e.g. "강남역 지하통로" → "강남역")
      const stationMatch = (curr.name + ' ' + curr.guidance).match(/[가-힣]+역/);
      guides[i] = { ...curr, subwayEnter: stationMatch?.[0] ?? '지하철역' };
    }
  }

  console.log('[Directions] TMAP 성공 - 거리:', totalDistanceMeters + 'm');
  return { vertexes, guides, totalDistanceMeters, totalDurationSeconds };
}

// ── Valhalla (secondary fallback) ────────────────────────────────────────────

const VALHALLA_URL = import.meta.env.DEV
  ? '/valhalla/route'
  : 'https://valhalla.openstreetmap.de/route';

function valhallaManeuverCode(type: number): number {
  if (type === 4) return 3;
  if (type === 5 || type === 6 || type === 7) return 2;
  if (type === 12 || type === 13 || type === 14) return 1;
  return 0;
}

function decodePolyline(encoded: string): [number, number][] {
  const factor = 1e6;
  const points: [number, number][] = [];
  let lat = 0, lon = 0, i = 0;
  while (i < encoded.length) {
    let shift = 0, val = 0, b: number;
    do { b = encoded.charCodeAt(i++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += val & 1 ? ~(val >> 1) : val >> 1;
    shift = 0; val = 0;
    do { b = encoded.charCodeAt(i++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += val & 1 ? ~(val >> 1) : val >> 1;
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

async function fetchRouteValhalla(
  originLat: number, originLon: number,
  destLat: number, destLon: number
): Promise<DirectionResult | null> {
  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lon: originLon, lat: originLat }, { lon: destLon, lat: destLat }],
      costing: 'pedestrian',
      directions_options: { units: 'km' },
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    trip?: {
      summary: { length: number; time: number };
      legs: Array<{
        shape: string;
        maneuvers: Array<{
          type: number; instruction: string;
          street_names?: string[]; length: number; begin_shape_index: number;
        }>;
      }>;
    };
  };
  if (!data.trip) return null;

  const vertexes: number[] = [];
  const guides: DirectionGuide[] = [];
  let allPoints: [number, number][] = [];

  for (const leg of data.trip.legs) {
    const points = decodePolyline(leg.shape);
    const offset = allPoints.length;
    allPoints = allPoints.concat(points);
    for (const [lat, lon] of points) vertexes.push(lon, lat);
    for (const m of leg.maneuvers) {
      const [lat, lon] = allPoints[offset + m.begin_shape_index] ?? points[0];
      guides.push({
        x: lon, y: lat,
        distance: Math.round(m.length * 1000),
        type: valhallaManeuverCode(m.type),
        guidance: m.instruction,
        name: m.street_names?.[0] ?? '',
      });
    }
  }

  if (vertexes.length < 4) return null;
  return {
    vertexes, guides,
    totalDistanceMeters: Math.round(data.trip.summary.length * 1000),
    totalDurationSeconds: Math.round(data.trip.summary.time),
  };
}

// ── OSRM (final fallback) ────────────────────────────────────────────────────

async function fetchRouteOsrm(
  originLat: number, originLon: number,
  destLat: number, destLon: number
): Promise<DirectionResult | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${originLon},${originLat};${destLon},${destLat}` +
      `?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        geometry: { coordinates: [number, number][] };
        legs: Array<{
          steps: Array<{
            distance: number; name: string;
            maneuver: { type: string; modifier?: string; location: [number, number] };
          }>;
        }>;
      }>;
    };
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;

    const route = data.routes[0];
    const vertexes: number[] = [];
    for (const [lon, lat] of route.geometry.coordinates) vertexes.push(lon, lat);

    const guides: DirectionGuide[] = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        const [lon, lat] = step.maneuver.location;
        const m = step.maneuver.modifier;
        const t = step.maneuver.type;
        const road = step.name ? ` (${step.name})` : '';
        let type = 0, guidance = `직진${road}`;
        if (t === 'arrive') { type = 3; guidance = '목적지 도착'; }
        else if (t === 'depart') { guidance = `출발${road}`; }
        else if (m?.includes('left')) { type = 2; guidance = `좌회전${road}`; }
        else if (m?.includes('right')) { type = 1; guidance = `우회전${road}`; }
        guides.push({ x: lon, y: lat, distance: step.distance, type, guidance, name: step.name });
      }
    }

    return {
      vertexes, guides,
      totalDistanceMeters: route.distance,
      totalDurationSeconds: Math.round(route.distance / WALKING_SPEED_MPS),
    };
  } catch (err) {
    console.error('[Directions] OSRM error:', err);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchRoute(
  originLat: number, originLon: number,
  destLat: number, destLon: number
): Promise<DirectionResult | null> {
  // 1순위: TMAP (한국 보행자 최적화 - 지하철역 통로 포함)
  if (TMAP_KEY) {
    try {
      const result = await fetchRouteTmap(originLat, originLon, destLat, destLon);
      if (result) return result;
      console.warn('[Directions] TMAP 결과 없음, Valhalla로 재시도');
    } catch (err) {
      console.warn('[Directions] TMAP 실패, Valhalla fallback:', err);
    }
  }
  // 2순위: Valhalla
  try {
    const result = await fetchRouteValhalla(originLat, originLon, destLat, destLon);
    if (result) return result;
    console.warn('[Directions] Valhalla 결과 없음, OSRM으로 재시도');
  } catch (err) {
    console.warn('[Directions] Valhalla 실패, OSRM fallback:', err);
  }
  // 최종 fallback: OSRM
  return fetchRouteOsrm(originLat, originLon, destLat, destLon);
}
