package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AudioDirective {
    private double pitchHz;          // 방향 비프 주파수 (300~600Hz)
    private double stereoPan;        // -1.0(좌) ~ 0.0(정면) ~ +1.0(우)
    private double volumeMultiplier; // 0.0 ~ 1.0
    private int    hapticIntensity;  // 0 ~ 255 (진동 강도)
    private double thetaDegrees;     // 현재 진행방향과 목표방향의 오차각
    private String beepPattern;      // "single" | "double" | "triple" | "continuous"
    private boolean voiceEnabled;    // 음성 TTS 활성화 여부
    private boolean hapticOnly;      // 극소음 구간 햅틱 전용 모드

    /**
     * θ → 직관적 방향 문자열
     */
    public String getDirectionHint() {
        if (Math.abs(thetaDegrees) <= 15) return "정면";
        if (thetaDegrees > 0)             return "오른쪽";
        return "왼쪽";
    }
}
