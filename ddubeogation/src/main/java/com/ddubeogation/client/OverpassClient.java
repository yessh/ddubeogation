package com.ddubeogation.client;

import com.ddubeogation.model.GpsPoint;
import com.ddubeogation.model.Poi;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OpenStreetMap Overpass API를 통해 주변 POI를 조회한다.
 *
 * 조회 카테고리: 편의점, 카페, 패스트푸드, 약국, 은행, 관광명소
 */
@Slf4j
@Component
public class OverpassClient {

    private final WebClient webClient;

    public OverpassClient(@Value("${ddubeogation.overpass.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .build();
    }

    public Mono<List<Poi>> queryPoisNearby(GpsPoint center, double radiusMeters) {
        String query = buildOverpassQuery(center, radiusMeters);

        return webClient.post()
            .uri("/interpreter")
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .bodyValue("data=" + query)
            .retrieve()
            .bodyToMono(Map.class)
            .map(this::parsePois)
            .onErrorReturn(List.of())
            .doOnSuccess(pois -> log.debug("[Overpass] Found {} POIs near ({}, {})",
                pois.size(), center.getLatitude(), center.getLongitude()));
    }

    /**
     * 보행자 내비게이션에 유용한 랜드마크 중심으로 조회
     */
    private String buildOverpassQuery(GpsPoint center, double radius) {
        return String.format("""
            [out:json][timeout:5];
            (
              node["amenity"~"cafe|fast_food|convenience|pharmacy|bank|atm"]
                  (around:%.0f,%.6f,%.6f);
              node["shop"~"convenience|supermarket"]
                  (around:%.0f,%.6f,%.6f);
              node["tourism"="attraction"]
                  (around:%.0f,%.6f,%.6f);
            );
            out body;
            """,
            radius, center.getLatitude(), center.getLongitude(),
            radius, center.getLatitude(), center.getLongitude(),
            radius, center.getLatitude(), center.getLongitude()
        );
    }

    @SuppressWarnings("unchecked")
    private List<Poi> parsePois(Map<?, ?> response) {
        List<Poi> result = new ArrayList<>();
        Object elements = response.get("elements");
        if (!(elements instanceof List<?> list)) return result;

        for (Object el : list) {
            if (!(el instanceof Map<?, ?> node)) continue;
            Map<?, ?> tags = (Map<?, ?>) node.get("tags");
            if (tags == null) continue;

            String name = (String) tags.getOrDefault("name", null);
            if (name == null) name = resolveDefaultName(tags);

            String amenity = tags.get("amenity") instanceof String a ? a : "";
            String shop    = tags.get("shop")    instanceof String s ? s : "";
            String category = amenity.isBlank() ? shop : amenity;

            double lat = toDouble(node.get("lat"));
            double lon = toDouble(node.get("lon"));
            String id  = String.valueOf(node.get("id"));

            result.add(Poi.builder()
                .id(id)
                .name(name)
                .category(category)
                .latitude(lat)
                .longitude(lon)
                .build());
        }
        return result;
    }

    /**
     * name 태그가 없을 때 amenity/shop 값으로 기본 이름 생성
     * 예: "convenience" → "편의점"
     */
    private String resolveDefaultName(Map<?, ?> tags) {
        String amenity = tags.get("amenity") instanceof String a ? a : "";
        String shop    = tags.get("shop")    instanceof String s ? s : "";
        String brand   = tags.get("brand")   instanceof String b ? b : "";

        if (!brand.isBlank()) return brand;
        return switch (amenity.isBlank() ? shop : amenity) {
            case "cafe"         -> "카페";
            case "convenience",
                 "supermarket"  -> "편의점";
            case "fast_food"    -> "패스트푸드";
            case "pharmacy"     -> "약국";
            case "bank"         -> "은행";
            case "atm"          -> "ATM";
            default             -> "상점";
        };
    }

    private double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        if (val instanceof String s) return Double.parseDouble(s);
        return 0.0;
    }
}
