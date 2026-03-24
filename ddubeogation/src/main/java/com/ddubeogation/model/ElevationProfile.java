package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ElevationProfile {
    private double startAltitude;
    private double endAltitude;
    private double gradePercent;      // 경사도 (%) — 양수=오르막, 음수=내리막
    private double maxGradePercent;   // 구간 최대 경사
    private String terrainDescription; // "flat" | "uphill" | "downhill" | "steep_uphill"

    public String toKoreanTerrain() {
        if (Math.abs(gradePercent) < 3.0) return "평지";
        if (gradePercent >= 10.0)          return "가파른 오르막";
        if (gradePercent >= 5.0)           return "오르막";
        if (gradePercent <= -10.0)         return "가파른 내리막";
        if (gradePercent <= -5.0)          return "내리막";
        return "완만한 경사";
    }
}
