package com.ddubeogation.client;

import com.ddubeogation.model.ElevationProfile;
import com.ddubeogation.model.GpsPoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Open-Elevation API를 통해 두 지점 간 경사도를 계산한다.
 * 기압계 데이터가 있으면 API 대신 기압계 값을 우선 사용한다.
 */
@Slf4j
@Component
public class ElevationClient {

    private final WebClient webClient;

    public ElevationClient(@Value("${ddubeogation.elevation.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .build();
    }

    public Mono<ElevationProfile> getProfile(GpsPoint from, GpsPoint to) {
        if (to == null) {
            return Mono.just(flatProfile(0, 0));
        }

        Map<String, Object> body = Map.of(
            "locations", List.of(
                Map.of("latitude", from.getLatitude(), "longitude", from.getLongitude()),
                Map.of("latitude", to.getLatitude(),   "longitude", to.getLongitude())
            )
        );

        return webClient.post()
            .uri("/lookup")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(Map.class)
            .map(res -> parseProfile(res, from, to))
            .onErrorReturn(flatProfile(from.getAltitude(), to.getAltitude()))
            .doOnSuccess(p -> log.debug("[Elevation] grade={}%", p.getGradePercent()));
    }

    @SuppressWarnings("unchecked")
    private ElevationProfile parseProfile(Map<?, ?> response, GpsPoint from, GpsPoint to) {
        try {
            List<?> results = (List<?>) response.get("results");
            double elevFrom = toDouble(((Map<?, ?>) results.get(0)).get("elevation"));
            double elevTo   = toDouble(((Map<?, ?>) results.get(1)).get("elevation"));
            return buildProfile(elevFrom, elevTo, from, to);
        } catch (Exception e) {
            log.warn("[Elevation] parse failed: {}", e.getMessage());
            return flatProfile(from.getAltitude(), to.getAltitude());
        }
    }

    private ElevationProfile buildProfile(
            double elevFrom, double elevTo, GpsPoint from, GpsPoint to) {

        double horizDist = Math.sqrt(
            Math.pow((to.getLatitude()  - from.getLatitude())  * 111_320, 2) +
            Math.pow((to.getLongitude() - from.getLongitude()) * 88_000,  2)
        );
        double elevDiff  = elevTo - elevFrom;
        double grade     = (horizDist > 0) ? (elevDiff / horizDist) * 100 : 0;

        String desc;
        if (Math.abs(grade) < 3)   desc = "flat";
        else if (grade >= 10)       desc = "steep_uphill";
        else if (grade >= 5)        desc = "uphill";
        else if (grade <= -10)      desc = "steep_downhill";
        else if (grade <= -5)       desc = "downhill";
        else                        desc = "slight_slope";

        return ElevationProfile.builder()
            .startAltitude(elevFrom)
            .endAltitude(elevTo)
            .gradePercent(grade)
            .maxGradePercent(Math.abs(grade))
            .terrainDescription(desc)
            .build();
    }

    private ElevationProfile flatProfile(double from, double to) {
        return ElevationProfile.builder()
            .startAltitude(from)
            .endAltitude(to)
            .gradePercent(0.0)
            .maxGradePercent(0.0)
            .terrainDescription("flat")
            .build();
    }

    private double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        return 0.0;
    }
}
