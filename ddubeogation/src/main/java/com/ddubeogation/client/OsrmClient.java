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
 * - /route : 출발지 → 목적지 경로 및 턴-바이-턴 스텝 계산
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
                String type     = maneuver.get("type")     instanceof String t ? t : "straight";
                String modifier = maneuver.get("modifier") instanceof String m ? m : "";
                String direction = resolveDirection(type, modifier);

                double bearing = toDouble(maneuver.get("bearing_after"));
                double dist    = toDouble(step.get("distance"));
                String name    = step.get("name") instanceof String n ? n : "";

                List<?> loc = maneuver.get("location") instanceof List<?> l ? l : List.of(0.0, 0.0);

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
