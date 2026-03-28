package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.List;
import java.util.stream.Collectors;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NavigationContext {
    private GpsPoint         currentPosition;
    private RouteStep        nextStep;
    private List<Poi>        nearbyPois;
    private double           distanceToDestination; // 남은 거리 (m)
    private boolean          isLastStep;

    /** LLM 프롬프트용: 상위 N개 랜드마크 POI 이름 문자열 */
    public String getTopPoiNames(int limit) {
        if (nearbyPois == null || nearbyPois.isEmpty()) return "없음";
        return nearbyPois.stream()
            .filter(p -> p.isLandmark() || p.getDistanceMeters() < 15)
            .limit(limit)
            .map(p -> p.getRelativePosition() + "쪽 " + p.getName())
            .collect(Collectors.joining(", "));
    }

    /** 현재 시간대 컨텍스트 */
    public String getTimeContext() {
        int hour = LocalTime.now().getHour();
        if (hour < 6)  return "새벽";
        if (hour < 11) return "아침";
        if (hour < 14) return "점심";
        if (hour < 18) return "오후";
        if (hour < 21) return "저녁";
        return "밤";
    }

}
