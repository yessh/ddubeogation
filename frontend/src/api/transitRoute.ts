const KAKAO_REST_KEY = import.meta.env.VITE_KAKAO_REST_KEY as string;
const SUBWAY_SPEED_KMH = 33; // 서울 지하철 평균 속도
const SUBWAY_BOARDING_SECONDS = 3 * 60; // 승강장 대기 + 탑승 여유 시간
const WALKING_SPEED_MPS = 4000 / 3600;

export interface SubwayStation {
  name: string;
  lat: number;
  lon: number;
}

export interface TransitSegment {
  type: 'walk' | 'subway';
  vertexes: number[]; // flat: [lon, lat, lon, lat, ...]
  distanceMeters: number;
  durationSeconds: number;
  label: string;
}

export interface TransitRouteResult {
  segments: TransitSegment[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  originStation: SubwayStation;
  destStation: SubwayStation;
}

async function findNearbyStation(lat: number, lon: number): Promise<SubwayStation | null> {
  try {
    const url =
      `https://dapi.kakao.com/v2/local/search/keyword.json` +
      `?query=지하철역&x=${lon}&y=${lat}&radius=1200&sort=distance&size=1`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      documents?: Array<{ place_name: string; x: string; y: string }>;
    };
    const doc = data.documents?.[0];
    if (!doc) return null;
    return { name: doc.place_name, lat: parseFloat(doc.y), lon: parseFloat(doc.x) };
  } catch {
    return null;
  }
}

async function fetchWalkSegment(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number
): Promise<{ vertexes: number[]; distanceMeters: number; durationSeconds: number } | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{ distance: number; geometry: { coordinates: [number, number][] } }>;
    };
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const vertexes: number[] = [];
    for (const [lon, lat] of route.geometry.coordinates) vertexes.push(lon, lat);
    return {
      vertexes,
      distanceMeters: route.distance,
      durationSeconds: Math.round(route.distance / WALKING_SPEED_MPS),
    };
  } catch {
    return null;
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchTransitRoute(
  originLat: number, originLon: number,
  destLat: number, destLon: number
): Promise<TransitRouteResult | null> {
  const [originStation, destStation] = await Promise.all([
    findNearbyStation(originLat, originLon),
    findNearbyStation(destLat, destLon),
  ]);
  if (!originStation || !destStation) return null;
  if (originStation.name === destStation.name) return null;

  const [walkTo, walkFrom] = await Promise.all([
    fetchWalkSegment(originLat, originLon, originStation.lat, originStation.lon),
    fetchWalkSegment(destStation.lat, destStation.lon, destLat, destLon),
  ]);
  if (!walkTo || !walkFrom) return null;

  const subwayDist = haversineMeters(originStation.lat, originStation.lon, destStation.lat, destStation.lon);
  const subwayDuration = Math.round((subwayDist / 1000 / SUBWAY_SPEED_KMH) * 3600) + SUBWAY_BOARDING_SECONDS;

  const segments: TransitSegment[] = [
    {
      type: 'walk',
      vertexes: walkTo.vertexes,
      distanceMeters: walkTo.distanceMeters,
      durationSeconds: walkTo.durationSeconds,
      label: `도보 → ${originStation.name}`,
    },
    {
      type: 'subway',
      vertexes: [originStation.lon, originStation.lat, destStation.lon, destStation.lat],
      distanceMeters: subwayDist,
      durationSeconds: subwayDuration,
      label: `${originStation.name} → ${destStation.name}`,
    },
    {
      type: 'walk',
      vertexes: walkFrom.vertexes,
      distanceMeters: walkFrom.distanceMeters,
      durationSeconds: walkFrom.durationSeconds,
      label: `${destStation.name} → 목적지`,
    },
  ];

  return {
    segments,
    totalDistanceMeters: walkTo.distanceMeters + subwayDist + walkFrom.distanceMeters,
    totalDurationSeconds: walkTo.durationSeconds + subwayDuration + walkFrom.durationSeconds,
    originStation,
    destStation,
  };
}
