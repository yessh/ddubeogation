package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GuidanceScript {
    private String  text;            // LLM 생성 안내 문구
    private String  shortText;       // 고소음용 1~2단어 요약
    private boolean fromCache;       // 캐시 사용 여부
    private String  cacheKey;
    private long    generatedAt;

    /**
     * 소음 레벨에 따라 적절한 문구 반환
     */
    public String getAdaptiveText(int noiseDb) {
        if (noiseDb >= 85) return null;          // 햅틱 전용
        if (noiseDb >= 75) return shortText;     // 핵심 단어만
        return text;                             // 전체 문구
    }
}
