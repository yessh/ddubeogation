package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImuData {
    // 가속도계 (m/s²)
    private double accelX;
    private double accelY;
    private double accelZ;

    // 자이로스코프 (rad/s)
    private double gyroX;
    private double gyroY;
    private double gyroZ;

    // 지자기 나침반 (μT)
    private double magX;
    private double magY;
    private double magZ;

    // 보행 감지
    private int    stepCount;
    private double stepLengthMeters; // 사용자 체형 보정값 (기본 0.75m)
    private double headingDegrees;   // 나침반 기반 방향

    private long timestamp;
}
