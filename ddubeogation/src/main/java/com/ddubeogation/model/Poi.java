package com.ddubeogation.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Poi {
    private String id;
    private String name;         // 예: "GS25 홍대점"
    private String category;     // convenience_store / cafe / pharmacy 등
    private double latitude;
    private double longitude;
    private double distanceMeters;
    private String relativePosition; // "left" | "right" | "ahead"
    private boolean isLandmark;      // 안내 문구 우선 사용 여부
}
