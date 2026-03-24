package com.ddubeogation.service;

import com.ddubeogation.client.ElevationClient;
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
    private final ElevationClient  elevationClient;

    private static final double POI_RADIUS_METERS     = 30.0;
    private static final double ARRIVAL_THRESHOLD_M   = 15.0;

    public Mono<NavigationContext> build(
            GpsPoint  position,
            RouteStep nextStep,
            int       noiseDb,
            double    distanceToDestination) {

        // 3가지 데이터를 병렬로 수집
        Mono<List<Poi>> poisMono = overpassClient
            .queryPoisNearby(position, POI_RADIUS_METERS)
            .map(pois -> enrichWithRelativePosition(pois, position))
            .subscribeOn(Schedulers.boundedElastic());

        Mono<ElevationProfile> elevMono = (nextStep != null)
            ? elevationClient.getProfile(position, nextStep.getEndPoint())
                             .subscribeOn(Schedulers.boundedElastic())
            : Mono.just(flatProfile());

        return Mono.zip(poisMono, elevMono)
            .map(tuple -> NavigationContext.builder()
                .currentPosition(position)
                .nextStep(nextStep)
                .nearbyPois(tuple.getT1())
                .elevationProfile(tuple.getT2())
                .ambientNoiseDb(noiseDb)
                .distanceToDestination(distanceToDestination)
                .isLastStep(distanceToDestination < ARRIVAL_THRESHOLD_M)
                .build())
            .doOnSuccess(ctx -> log.debug("[Context] pois={} grade={}% noise={}dB",
                ctx.getNearbyPois().size(),
                ctx.getElevationProfile().getGradePercent(),
                ctx.getAmbientNoiseDb()))
            .onErrorReturn(buildFallbackContext(position, nextStep, noiseDb, distanceToDestination));
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

    private ElevationProfile flatProfile() {
        return ElevationProfile.builder()
            .gradePercent(0.0)
            .terrainDescription("flat")
            .build();
    }

    private NavigationContext buildFallbackContext(
            GpsPoint pos, RouteStep step, int noise, double dist) {
        log.warn("[Context] Fallback context used — external API unavailable");
        return NavigationContext.builder()
            .currentPosition(pos)
            .nextStep(step)
            .nearbyPois(List.of())
            .elevationProfile(flatProfile())
            .ambientNoiseDb(noise)
            .distanceToDestination(dist)
            .isLastStep(dist < ARRIVAL_THRESHOLD_M)
            .build();
    }
}
