package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteStep {
    private String  direction;        // "straight" | "turn_right" | "turn_left" | "arrive"
    private double  targetBearing;    // 이 스텝에서 가야 할 방향 (도)
    private GpsPoint startPoint;
    private GpsPoint endPoint;
    private double  distanceMeters;
    private String  streetName;
    private boolean isCrossing;       // 횡단보도 포함 여부
    private int     sequenceIndex;
}
