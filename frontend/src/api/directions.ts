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

// ── Kakao Mobility Directions API ──────────────────────────────────────────
// 자동차 경로 API지만 도로망은 도보와 동일. 시간은 거리 기반으로 재계산.

interface KakaoRouteResponse {
  routes: Array<{
    result_code: number;
    result_msg: string;
    summary: {
      distance: number; // meters
      duration: number; // seconds (car — 사용 안 함)
    };
    sections: Array<{
      roads: Array<{
        name: string;
        distance: number;
        vertexes: number[]; // [lon, lat, lon, lat, ...]
      }>;
      guides: Array<{
        name: string;
        x: number;
        y: number;
        distance: number;
        duration: number;
        type: number;
        guidance: string;
      }>;
    }>;
  }>;
}

// Kakao guide type → our type code
// 0: 직진, 1: 좌회전, 2: 우회전, 3: 우측방향, 4: 좌측방향
// 5: U턴, 6: 출발, 7: 목적지
function kakaoTypeCode(type: number): number {
  if (type === 7) return 3; // 도착
  if (type === 1 || type === 4) return 1; // 좌회전/좌측
  if (type === 2 || type === 3) return 2; // 우회전/우측
  return 0; // 직진/기타
}

export async function fetchRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<DirectionResult | null> {
  const restKey = import.meta.env.VITE_KAKAO_REST_KEY as string;
  if (!restKey) {
    console.error('[Directions] VITE_KAKAO_REST_KEY is not set');
    return null;
  }

  try {
    const url =
      `/kakao-navi/v1/directions` +
      `?origin=${originLon},${originLat}` +
      `&destination=${destLon},${destLat}` +
      `&priority=RECOMMEND` +
      `&car_fuel=GASOLINE&car_hipass=false`;

    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
    });

    if (!res.ok) {
      console.error('[Directions] Kakao API error:', res.status);
      return null;
    }

    const data = (await res.json()) as KakaoRouteResponse;
    const route = data.routes?.[0];
    if (!route || route.result_code !== 0) {
      console.warn('[Directions] Kakao route failed:', route?.result_code, route?.result_msg);
      return null;
    }

    // Collect vertexes and guides from all sections
    const vertexes: number[] = [];
    const guides: DirectionGuide[] = [];

    for (const section of route.sections) {
      for (const road of section.roads) {
        vertexes.push(...road.vertexes);
      }
      for (const g of section.guides) {
        guides.push({
          x: g.x,
          y: g.y,
          distance: g.distance,
          type: kakaoTypeCode(g.type),
          guidance: g.guidance,
          name: g.name,
        });
      }
    }

    const totalDistanceMeters = route.summary.distance;
    // 도보 시간 = 거리 ÷ 도보 속도 (4 km/h)
    const totalDurationSeconds = Math.round(totalDistanceMeters / WALKING_SPEED_MPS);

    return { vertexes, guides, totalDistanceMeters, totalDurationSeconds };
  } catch (err) {
    console.error('[Directions] fetch error:', err);
    return null;
  }
}
