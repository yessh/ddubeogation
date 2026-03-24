package com.ddubeogation.client;

import com.ddubeogation.model.GpsPoint;
import com.ddubeogation.model.RouteStep;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OSRM (Open Source Routing Machine) 클라이언트
 *
 * - /nearest : GPS 좌표를 가장 가까운 도로에 스냅
 * - /route   : 출발지 → 목적지 경로 및 턴-바이-턴 스텝 계산
 */
@Slf4j
@Component
public class OsrmClient {

    private final WebClient webClient;

    public OsrmClient(@Value("${ddubeogation.osrm.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .build();
    }

    /**
     * GPS 좌표를 도로 위에 스냅 (Map-Matching)
     * HDOP가 높은 GPS 불량 구간에서 Kalman 결과를 도로에 고정
     */
    public Mono<GpsPoint> snapToRoad(GpsPoint point) {
        String uri = String.format("/nearest/v1/foot/%.6f,%.6f?number=1",
            point.getLongitude(), point.getLatitude());

        return webClient.get()
            .uri(uri)
            .retrieve()
            .bodyToMono(Map.class)
            .map(res -> extractNearestPoint(res, point))
            .onErrorReturn(point) // 실패 시 원본 반환
            .doOnSuccess(p -> log.debug("[OSRM] Snap ({:.6f},{:.6f}) → ({:.6f},{:.6f})",
                point.getLatitude(), point.getLongitude(),
                p.getLatitude(), p.getLongitude()));
    }

    /**
     * 보행자 경로 계산 (steps=true, overview=full)
     */
    public Mono<List<RouteStep>> getRoute(GpsPoint origin, GpsPoint destination) {
        String uri = String.format(
            "/route/v1/foot/%.6f,%.6f;%.6f,%.6f?steps=true&overview=false&geometries=geojson",
            origin.getLongitude(), origin.getLatitude(),
            destination.getLongitude(), destination.getLatitude()
        );

        return webClient.get()
            .uri(uri)
            .retrieve()
            .bodyToMono(Map.class)
            .map(this::extractRouteSteps)
            .onErrorReturn(List.of())
            .doOnSuccess(steps -> log.debug("[OSRM] Route has {} steps", steps.size()));
    }

    @SuppressWarnings("unchecked")
    private GpsPoint extractNearestPoint(Map<?, ?> response, GpsPoint original) {
        try {
            List<?> waypoints = (List<?>) response.get("waypoints");
            Map<?, ?> wp = (Map<?, ?>) waypoints.get(0);
            List<?> loc = (List<?>) wp.get("location");
            double lon = ((Number) loc.get(0)).doubleValue();
            double lat = ((Number) loc.get(1)).doubleValue();
            return GpsPoint.builder()
                .latitude(lat)
                .longitude(lon)
                .altitude(original.getAltitude())
                .accuracy(original.getAccuracy())
                .hdop(original.getHdop())
                .bearing(original.getBearing())
                .timestamp(original.getTimestamp())
                .mapMatched(true)
                .build();
        } catch (Exception e) {
            log.warn("[OSRM] snap parse failed, returning original: {}", e.getMessage());
            return original;
        }
    }

    @SuppressWarnings("unchecked")
    private List<RouteStep> extractRouteSteps(Map<?, ?> response) {
        List<RouteStep> steps = new ArrayList<>();
        try {
            List<?> routes = (List<?>) response.get("routes");
            if (routes == null || routes.isEmpty()) return steps;

            Map<?, ?> route = (Map<?, ?>) routes.get(0);
            List<?> legs    = (List<?>) route.get("legs");
            if (legs == null || legs.isEmpty()) return steps;

            Map<?, ?> leg     = (Map<?, ?>) legs.get(0);
            List<?> stepsList = (List<?>) leg.get("steps");
            if (stepsList == null) return steps;

            int idx = 0;
            for (Object s : stepsList) {
                Map<?, ?> step = (Map<?, ?>) s;
                Map<?, ?> maneuver = (Map<?, ?>) step.get("maneuver");
                String type = (String) maneuver.getOrDefault("type", "straight");
                String modifier = (String) maneuver.getOrDefault("modifier", "");
                String direction = resolveDirection(type, modifier);

                double bearing = toDouble(maneuver.get("bearing_after"));
                double dist    = toDouble(step.get("distance"));
                String name    = (String) step.getOrDefault("name", "");

                List<?> loc = (List<?>) ((Map<?, ?>) maneuver.get("location")).containsKey("coordinates")
                    ? (List<?>) ((Map<?, ?>) maneuver.get("location")).get("coordinates")
                    : List.of(0.0, 0.0);

                GpsPoint startPt = GpsPoint.builder()
                    .longitude(toDouble(loc.get(0)))
                    .latitude(toDouble(loc.get(1)))
                    .build();

                steps.add(RouteStep.builder()
                    .direction(direction)
                    .targetBearing(bearing)
                    .startPoint(startPt)
                    .distanceMeters(dist)
                    .streetName(name)
                    .isCrossing(name.contains("횡단") || type.equals("end of road"))
                    .sequenceIndex(idx++)
                    .build());
            }
        } catch (Exception e) {
            log.error("[OSRM] route parse failed: {}", e.getMessage());
        }
        return steps;
    }

    private String resolveDirection(String type, String modifier) {
        if (type.equals("arrive"))         return "arrive";
        if (modifier.contains("right"))    return "turn_right";
        if (modifier.contains("left"))     return "turn_left";
        if (modifier.contains("straight")) return "straight";
        return "straight";
    }

    private double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        return 0.0;
    }
}
