import type { DirectionGuide } from './directions';

const KAKAO_REST_KEY = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;
const KAKAO_LOCAL_URL = 'https://dapi.kakao.com/v2/local/search/category.json';

// Categories searched for landmarks, in priority order (index = priority)
const CATEGORIES = [
  'SW8', // 지하철역
  'MT1', // 대형마트
  'CS2', // 편의점
  'CE7', // 카페
  'BK9', // 은행
  'PM9', // 약국
  'HP8', // 병원
] as const;

const SEARCH_RADIUS_M = 40;

interface KakaoPlace {
  place_name: string;
  distance: string;
}

async function searchCategory(code: string, lon: number, lat: number): Promise<KakaoPlace | null> {
  if (!KAKAO_REST_KEY) return null;
  try {
    const url =
      `${KAKAO_LOCAL_URL}?category_group_code=${code}` +
      `&x=${lon}&y=${lat}&radius=${SEARCH_RADIUS_M}&sort=distance`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { documents: KakaoPlace[] };
    return data.documents[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchNearestLandmark(lon: number, lat: number): Promise<string | null> {
  const results = await Promise.all(
    CATEGORIES.map((code, priority) =>
      searchCategory(code, lon, lat).then((place) =>
        place ? { name: place.place_name, dist: parseInt(place.distance), priority } : null,
      ),
    ),
  );

  const valid = results.filter(Boolean) as { name: string; dist: number; priority: number }[];
  if (!valid.length) return null;

  // Sort by distance; break ties by category priority
  valid.sort((a, b) =>
    Math.abs(a.dist - b.dist) < 5 ? a.priority - b.priority : a.dist - b.dist,
  );

  return valid[0].name;
}

/** Enriches turn guides with nearby landmark names, and subway entry guides with station names. */
export async function enrichGuidesWithLandmarks(guides: DirectionGuide[]): Promise<DirectionGuide[]> {
  const enriched = [...guides];
  await Promise.all(
    enriched.map(async (guide, i) => {
      if (guide.subwayEnter) {
        // Confirm/refine station name via Kakao SW8 search (larger radius for station entrances)
        if (!KAKAO_REST_KEY) return;
        try {
          const url =
            `${KAKAO_LOCAL_URL}?category_group_code=SW8` +
            `&x=${guide.x}&y=${guide.y}&radius=100&sort=distance`;
          const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
          if (res.ok) {
            const data = (await res.json()) as { documents: { place_name: string }[] };
            const station = data.documents[0];
            if (station) enriched[i] = { ...guide, subwayEnter: station.place_name };
          }
        } catch { /* keep TMAP-parsed name */ }
        return;
      }
      if (guide.type !== 1 && guide.type !== 2) return; // only left/right turns for landmark enrichment
      const landmark = await fetchNearestLandmark(guide.x, guide.y);
      if (landmark) enriched[i] = { ...guide, landmark };
    }),
  );
  return enriched;
}
