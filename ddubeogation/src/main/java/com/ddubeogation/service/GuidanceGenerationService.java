package com.ddubeogation.service;

import com.ddubeogation.client.GeminiClient;
import com.ddubeogation.model.GuidanceScript;
import com.ddubeogation.model.NavigationContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * LLM(Claude)을 호출하여 컨텍스트 기반 안내 문구를 생성한다.
 *
 * 캐싱 전략:
 *   - 동일 (direction + 상위POI + 경사 등급) 조합은 Redis에서 재사용
 *   - TTL 1시간 (POI는 잘 변하지 않으므로)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GuidanceGenerationService {

    private final GeminiClient geminiClient;
    private final ReactiveStringRedisTemplate     redis;

    private static final String CACHE_PREFIX = "guidance:";
    private static final Duration CACHE_TTL  = Duration.ofHours(1);

    private static final String SYSTEM_PROMPT = """
        당신은 시각적 UI가 전혀 없는 보행 내비게이션 AI입니다.
        사용자는 스마트폰 화면을 보지 않고 오직 귀로만 길을 찾습니다.

        반드시 지킬 규칙:
        1. 절대로 거리(m, km, 미터, 킬로미터)를 언급하지 마세요.
        2. 주변 POI(편의점, 카페, 간판 등)와 지형을 자연스럽게 문장에 녹이세요.
        3. 안내 문구는 20자 이내의 구어체 한국어로 작성하세요.
        4. 경사가 5% 이상이면 체감 표현(예: '가파른 오르막')을 포함하세요.
        5. 도착 직전에는 '고개를 드세요'처럼 시선 해방 메시지를 포함하세요.

        응답 형식 (JSON):
        {
          "text": "전체 안내 문구 (20자 이내)",
          "shortText": "핵심 단어 (고소음용, 1~4자)"
        }
        """;

    public Mono<GuidanceScript> generate(NavigationContext ctx) {
        String cacheKey = buildCacheKey(ctx);

        return redis.opsForValue().get(CACHE_PREFIX + cacheKey)
            .map(cached -> {
                log.debug("[Guidance] Cache hit: {}", cacheKey);
                return parseScript(cached, cacheKey, true);
            })
            .switchIfEmpty(
                callLlm(ctx, cacheKey)
            );
    }

    private Mono<GuidanceScript> callLlm(NavigationContext ctx, String cacheKey) {
        String userPrompt = buildUserPrompt(ctx);

        return geminiClient.complete(SYSTEM_PROMPT, userPrompt)
            .map(response -> parseScript(response, cacheKey, false))
            .flatMap(script -> {
                // 캐시 저장 (마지막 구간이 아닌 일반 구간만)
                if (!ctx.isLastStep()) {
                    return redis.opsForValue()
                        .set(CACHE_PREFIX + cacheKey, script.getText(), CACHE_TTL)
                        .thenReturn(script);
                }
                return Mono.just(script);
            })
            .onErrorReturn(buildFallbackScript(ctx));
    }

    private String buildUserPrompt(NavigationContext ctx) {
        String direction = switch (ctx.getNextStep() != null
                ? ctx.getNextStep().getDirection() : "straight") {
            case "turn_right" -> "우회전";
            case "turn_left"  -> "좌회전";
            case "arrive"     -> "목적지 도착";
            default            -> "직진";
        };

        ElevationInfo elev = extractElevation(ctx);

        return String.format("""
            보행자 안내 문구를 생성하세요:
            - 다음 행동: %s
            - 주변 POI: %s
            - 지형: %s (경사 %s%%)
            - 현재 시간대: %s
            - 마지막 구간: %s
            """,
            direction,
            ctx.getTopPoiNames(2),
            elev.description,
            elev.grade,
            ctx.getTimeContext(),
            ctx.isLastStep() ? "예 (도착 직전)" : "아니오"
        );
    }

    /**
     * 캐시 키: 방향 + 경사 등급 + 가장 가까운 랜드마크 POI 이름으로 구성
     * (위치 정밀도가 아닌 맥락 조합으로 캐시하여 재사용률 높임)
     */
    private String buildCacheKey(NavigationContext ctx) {
        String dir      = ctx.getNextStep() != null ? ctx.getNextStep().getDirection() : "straight";
        String terrain  = ctx.getElevationProfile() != null
            ? ctx.getElevationProfile().toKoreanTerrain() : "평지";
        String topPoi   = ctx.getNearbyPois().isEmpty()
            ? "none"
            : ctx.getNearbyPois().get(0).getName().replaceAll("\\s", "");
        return String.format("%s_%s_%s", dir, terrain, topPoi);
    }

    private GuidanceScript parseScript(String raw, String cacheKey, boolean fromCache) {
        // JSON 파싱 (간단 추출)
        String text      = extractJsonField(raw, "text");
        String shortText = extractJsonField(raw, "shortText");

        if (text.isBlank()) text = raw.trim(); // 파싱 실패 시 전체 응답 사용

        return GuidanceScript.builder()
            .text(text)
            .shortText(shortText.isBlank() ? text.substring(0, Math.min(4, text.length())) : shortText)
            .fromCache(fromCache)
            .cacheKey(cacheKey)
            .generatedAt(System.currentTimeMillis())
            .build();
    }

    private String extractJsonField(String json, String field) {
        String marker = "\"" + field + "\"";
        int start = json.indexOf(marker);
        if (start < 0) return "";
        int colon = json.indexOf(':', start);
        int quote1 = json.indexOf('"', colon + 1);
        int quote2 = json.indexOf('"', quote1 + 1);
        if (quote1 < 0 || quote2 < 0) return "";
        return json.substring(quote1 + 1, quote2);
    }

    private GuidanceScript buildFallbackScript(NavigationContext ctx) {
        String dir = ctx.getNextStep() != null ? ctx.getNextStep().getDirection() : "straight";
        String text = switch (dir) {
            case "turn_right" -> "오른쪽으로 도세요.";
            case "turn_left"  -> "왼쪽으로 도세요.";
            case "arrive"     -> "도착했어요.";
            default            -> "계속 직진하세요.";
        };
        return GuidanceScript.builder()
            .text(text)
            .shortText(dir.equals("turn_right") ? "우회전" : dir.equals("turn_left") ? "좌회전" : "직진")
            .fromCache(false)
            .generatedAt(System.currentTimeMillis())
            .build();
    }

    private record ElevationInfo(String description, String grade) {}

    private ElevationInfo extractElevation(NavigationContext ctx) {
        if (ctx.getElevationProfile() == null) return new ElevationInfo("평지", "0");
        return new ElevationInfo(
            ctx.getElevationProfile().toKoreanTerrain(),
            String.format("%.1f", ctx.getElevationProfile().getGradePercent())
        );
    }
}
