package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GpsPoint {
    private double latitude;
    private double longitude;
    private double altitude;       // 기압계 보정 고도 (m)
    private double accuracy;       // 추정 오차 반경 (m)
    private double hdop;           // GPS 수평 정밀도 저하율
    private double bearing;        // 진행 방향 (도, 0=북)
    private long   timestamp;      // epoch millis
    private boolean mapMatched;    // 도로 스냅 완료 여부
}
