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
    private String  shortText;       // 요약 문구
    private boolean fromCache;       // 캐시 사용 여부
    private String  cacheKey;
    private long    generatedAt;
}
