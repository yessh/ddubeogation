// Walking speed for duration estimate: 4 km/h
const WALKING_SPEED_MPS = 4000 / 3600;

export interface DirectionGuide {
  x: number; // longitude
  y: number; // latitude
  distance: number;
  type: number;
  guidance: string;
  name: string;
}

export interface DirectionResult {
  vertexes: number[]; // flat array: [lon, lat, lon, lat, ...]
  guides: DirectionGuide[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export async function fetchRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<DirectionResult | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${originLon},${originLat};${destLon},${destLat}` +
      `?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('[Directions] OSRM API error:', res.status);
      return null;
    }

    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs: Array<{
          steps: Array<{
            distance: number;
            name: string;
            maneuver: {
              type: string;
              modifier?: string;
              location: [number, number];
            };
          }>;
        }>;
      }>;
    };

    if (data.code !== 'Ok' || !data.routes?.[0]) return null;

    const route = data.routes[0];

    const vertexes: number[] = [];
    for (const [lon, lat] of route.geometry.coordinates) {
      vertexes.push(lon, lat);
    }

    const guides: DirectionGuide[] = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        const [lon, lat] = step.maneuver.location;
        guides.push({
          x: lon,
          y: lat,
          distance: step.distance,
          type: maneuverTypeCode(step.maneuver.type, step.maneuver.modifier),
          guidance: guidanceText(step.maneuver.type, step.maneuver.modifier, step.name),
          name: step.name,
        });
      }
    }

    return {
      vertexes,
      guides,
      totalDistanceMeters: route.distance,
      // OSRM duration이 부정확하므로 거리 기반 도보 시간으로 재계산 (4 km/h)
      totalDurationSeconds: Math.round(route.distance / WALKING_SPEED_MPS),
    };
  } catch (err) {
    console.error('[Directions] Fetch error:', err);
    return null;
  }
}

function maneuverTypeCode(type: string, modifier?: string): number {
  if (type === 'arrive') return 3;
  if (!modifier || modifier === 'straight' || modifier === 'uturn') return 0;
  if (modifier.includes('left')) return 2;
  if (modifier.includes('right')) return 1;
  return 0;
}

function guidanceText(type: string, modifier?: string, name?: string): string {
  const road = name ? ` (${name})` : '';
  if (type === 'depart') return `출발${road}`;
  if (type === 'arrive') return '목적지 도착';
  if (!modifier || modifier === 'straight') return `직진${road}`;
  if (modifier === 'slight left') return `왼쪽 방향${road}`;
  if (modifier === 'left') return `좌회전${road}`;
  if (modifier === 'sharp left') return `급좌회전${road}`;
  if (modifier === 'slight right') return `오른쪽 방향${road}`;
  if (modifier === 'right') return `우회전${road}`;
  if (modifier === 'sharp right') return `급우회전${road}`;
  if (modifier === 'uturn') return `유턴${road}`;
  return `직진${road}`;
}
