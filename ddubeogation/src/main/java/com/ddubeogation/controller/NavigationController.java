package com.ddubeogation.controller;

import com.ddubeogation.model.*;
import com.ddubeogation.service.NavigationOrchestrator;
import com.ddubeogation.service.RouteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@Slf4j
@RestController
@RequestMapping("/api/v1/navigation")
@RequiredArgsConstructor
public class NavigationController {

    private final NavigationOrchestrator orchestrator;
    private final RouteService           routeService;

    /**
     * 내비게이션 세션 시작: 출발지 → 목적지 경로 초기화
     *
     * POST /api/v1/navigation/start
     * Body: { sessionId, origin: {lat, lon}, destination: {lat, lon} }
     */
    @PostMapping("/start")
    public Mono<ResponseEntity<String>> startNavigation(
            @RequestBody StartRequest req) {

        GpsPoint origin = GpsPoint.builder()
            .latitude(req.originLat())
            .longitude(req.originLon())
            .build();
        GpsPoint dest = GpsPoint.builder()
            .latitude(req.destLat())
            .longitude(req.destLon())
            .build();

        return routeService.initRoute(req.sessionId(), origin, dest)
            .thenReturn(ResponseEntity.ok("Navigation started: " + req.sessionId()));
    }

    /**
     * 위치 업데이트 — 주 폴링 엔드포인트 (50ms 주기)
     *
     * POST /api/v1/navigation/update
     * Body: NavigationRequest (GPS, IMU, 소음, 머리방향)
     */
    @PostMapping("/update")
    public Mono<ResponseEntity<NavigationResponse>> update(
            @Valid @RequestBody NavigationRequest request) {

        return orchestrator.process(request)
            .map(ResponseEntity::ok)
            .onErrorResume(e -> {
                log.error("[Nav] update error session={}: {}", request.getSessionId(), e.getMessage());
                return Mono.just(ResponseEntity.internalServerError().build());
            });
    }

    /**
     * 세션 종료
     *
     * DELETE /api/v1/navigation/{sessionId}
     */
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> endNavigation(@PathVariable String sessionId) {
        routeService.clearSession(sessionId);
        log.info("[Nav] Session {} ended", sessionId);
        return ResponseEntity.noContent().build();
    }

    // ─── 요청 DTO ───────────────────────────────────────────────────

    public record StartRequest(
        String sessionId,
        double originLat,
        double originLon,
        double destLat,
        double destLon
    ) {}
}
