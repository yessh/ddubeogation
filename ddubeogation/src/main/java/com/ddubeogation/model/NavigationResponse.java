package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NavigationResponse {
    private GpsPoint       correctedPosition; // Kalman 보정된 위치
    private GuidanceScript guidance;          // LLM 생성 안내 문구
    private AudioDirective audioDirective;    // 3D 오디오 파라미터
    private RouteStep      currentStep;
    private double         distanceToDestination;
    private boolean        arrived;
    private String         sessionId;
}
