package com.ddubeogation.service;

import com.ddubeogation.client.OverpassClient;
import com.ddubeogation.model.*;
import com.ddubeogation.util.GeoUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;

/**
 * POI, 고도, 소음 데이터를 병렬로 수집하여 NavigationContext를 구성한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContextBuilderService {

    private final OverpassClient   overpassClient;

    private static final double POI_RADIUS_METERS     = 30.0;
    private static final double ARRIVAL_THRESHOLD_M   = 15.0;

    public Mono<NavigationContext> build(
            GpsPoint  position,
            RouteStep nextStep,
            double    distanceToDestination) {

        return overpassClient
            .queryPoisNearby(position, POI_RADIUS_METERS)
            .map(pois -> enrichWithRelativePosition(pois, position))
            .subscribeOn(Schedulers.boundedElastic())
            .map(pois -> NavigationContext.builder()
                .currentPosition(position)
                .nextStep(nextStep)
                .nearbyPois(pois)
                .distanceToDestination(distanceToDestination)
                .isLastStep(distanceToDestination < ARRIVAL_THRESHOLD_M)
                .build())
            .doOnSuccess(ctx -> log.debug("[Context] pois={}", ctx.getNearbyPois().size()))
            .onErrorReturn(buildFallbackContext(position, nextStep, distanceToDestination));
    }

    /**
     * 각 POI에 사용자 기준 상대 위치(left/right/ahead)와 거리를 계산하여 추가
     */
    private List<Poi> enrichWithRelativePosition(List<Poi> pois, GpsPoint userPos) {
        return pois.stream().map(poi -> {
            double dist    = GeoUtils.distanceMeters(userPos, GpsPoint.builder()
                .latitude(poi.getLatitude()).longitude(poi.getLongitude()).build());
            double bearing = GeoUtils.bearingDegrees(userPos, GpsPoint.builder()
                .latitude(poi.getLatitude()).longitude(poi.getLongitude()).build());
            String relPos  = GeoUtils.relativePosition(userPos.getBearing(), bearing);

            return Poi.builder()
                .id(poi.getId())
                .name(poi.getName())
                .category(poi.getCategory())
                .latitude(poi.getLatitude())
                .longitude(poi.getLongitude())
                .distanceMeters(dist)
                .relativePosition(relPos)
                .isLandmark(isLandmark(poi))
                .build();
        })
        .filter(p -> p.getDistanceMeters() < POI_RADIUS_METERS)
        .sorted((a, b) -> Double.compare(a.getDistanceMeters(), b.getDistanceMeters()))
        .toList();
    }

    /**
     * 랜드마크 판별: 편의점, 카페, 은행, 약국 등 시각적으로 두드러진 POI
     */
    private boolean isLandmark(Poi poi) {
        String cat = poi.getCategory();
        if (cat == null) return false;
        return cat.contains("convenience") || cat.contains("cafe")
            || cat.contains("bank") || cat.contains("pharmacy")
            || cat.contains("fast_food") || cat.contains("restaurant");
    }

    private NavigationContext buildFallbackContext(
            GpsPoint pos, RouteStep step, double dist) {
        log.warn("[Context] Fallback context used — external API unavailable");
        return NavigationContext.builder()
            .currentPosition(pos)
            .nextStep(step)
            .nearbyPois(List.of())
            .distanceToDestination(dist)
            .isLastStep(dist < ARRIVAL_THRESHOLD_M)
            .build();
    }
}
