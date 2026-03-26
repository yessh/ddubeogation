package com.ddubeogation.model;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NavigationRequest {
    @NotNull private GpsPoint rawGps;
    @NotNull private ImuData  imu;
    private double barometerAltitude;   // 기압계 고도 (m)
    private double headBearing;         // 머리 방향 (도) — Head Tracker
    private String destinationId;       // POI ID 또는 좌표 문자열 "lat,lon"
    private String sessionId;
}
