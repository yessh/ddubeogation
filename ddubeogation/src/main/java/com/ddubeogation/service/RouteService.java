package com.ddubeogation.service;

import com.ddubeogation.client.OsrmClient;
import com.ddubeogation.model.GpsPoint;
import com.ddubeogation.model.RouteStep;
import com.ddubeogation.util.GeoUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 세션별 경로를 관리하고 현재 위치에서 다음 스텝을 결정한다.
 *
 * 경로 이탈 감지:
 *   현재 위치가 현재 스텝의 종점에서 OFFROUTE_THRESHOLD_M 이상 벗어나면
 *   OSRM으로 경로를 재계산한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RouteService {

    private final OsrmClient osrmClient;

    private static final double STEP_ARRIVAL_THRESHOLD_M = 10.0;  // 스텝 완료 판정 거리
    private static final double OFFROUTE_THRESHOLD_M     = 30.0;  // 경로 이탈 판정 거리
    private static final double DEST_ARRIVAL_THRESHOLD_M = 15.0;  // 목적지 도착 판정 거리

    // 세션 ID → (경로 스텝 리스트, 현재 스텝 인덱스)
    private final Map<String, List<RouteStep>> sessionRoutes  = new ConcurrentHashMap<>();
    private final Map<String, Integer>         sessionIndices = new ConcurrentHashMap<>();
    private final Map<String, GpsPoint>        destinations   = new ConcurrentHashMap<>();

    public Mono<Void> initRoute(String sessionId, GpsPoint origin, GpsPoint destination) {
        destinations.put(sessionId, destination);
        return osrmClient.getRoute(origin, destination)
            .doOnSuccess(steps -> {
                sessionRoutes.put(sessionId, steps);
                sessionIndices.put(sessionId, 0);
                log.info("[Route] Session {} initialized with {} steps", sessionId, steps.size());
            })
            .then();
    }

    /**
     * 현재 위치를 기반으로 다음 스텝을 결정하고 필요 시 경로 재계산
     */
    public Mono<RouteStep> getCurrentStep(String sessionId, GpsPoint currentPos) {
        List<RouteStep> route = sessionRoutes.get(sessionId);
        if (route == null || route.isEmpty()) {
            return Mono.empty();
        }

        int idx = sessionIndices.getOrDefault(sessionId, 0);
        RouteStep current = route.get(idx);

        // 현재 스텝의 종점 도달 여부 확인
        if (current.getEndPoint() != null) {
            double distToEnd = GeoUtils.distanceMeters(currentPos, current.getEndPoint());

            if (distToEnd < STEP_ARRIVAL_THRESHOLD_M && idx + 1 < route.size()) {
                // 다음 스텝으로 전진
                int nextIdx = idx + 1;
                sessionIndices.put(sessionId, nextIdx);
                log.debug("[Route] Session {} advanced to step {}", sessionId, nextIdx);
                return Mono.just(route.get(nextIdx));
            }

            // 경로 이탈 감지
            if (isOffRoute(currentPos, current)) {
                log.warn("[Route] Session {} off-route detected. Recalculating...", sessionId);
                GpsPoint dest = destinations.get(sessionId);
                return osrmClient.getRoute(currentPos, dest)
                    .doOnSuccess(newRoute -> {
                        sessionRoutes.put(sessionId, newRoute);
                        sessionIndices.put(sessionId, 0);
                    })
                    .filter(steps -> !steps.isEmpty())
                    .map(steps -> steps.get(0));
            }
        }

        return Mono.just(current);
    }

    public double getDistanceToDestination(String sessionId, GpsPoint currentPos) {
        GpsPoint dest = destinations.get(sessionId);
        if (dest == null) return Double.MAX_VALUE;
        return GeoUtils.distanceMeters(currentPos, dest);
    }

    public boolean hasArrived(String sessionId, GpsPoint currentPos) {
        return getDistanceToDestination(sessionId, currentPos) < DEST_ARRIVAL_THRESHOLD_M;
    }

    public void clearSession(String sessionId) {
        sessionRoutes.remove(sessionId);
        sessionIndices.remove(sessionId);
        destinations.remove(sessionId);
    }

    /**
     * 현재 스텝의 경로선에서 사용자가 벗어났는지 판별
     * 단순화: 스텝 시작점 또는 종점으로부터의 거리로 계산
     */
    private boolean isOffRoute(GpsPoint pos, RouteStep step) {
        if (step.getStartPoint() == null) return false;
        double distFromLine = distanceFromSegment(pos, step.getStartPoint(), step.getEndPoint());
        return distFromLine > OFFROUTE_THRESHOLD_M;
    }

    /**
     * 점 P와 선분 AB 사이의 최단 거리 (미터)
     */
    private double distanceFromSegment(GpsPoint p, GpsPoint a, GpsPoint b) {
        if (a == null || b == null) return 0;
        double ax = a.getLongitude(), ay = a.getLatitude();
        double bx = b.getLongitude(), by = b.getLatitude();
        double px = p.getLongitude(), py = p.getLatitude();

        double dx = bx - ax, dy = by - ay;
        double lenSq = dx * dx + dy * dy;
        if (lenSq == 0) return GeoUtils.distanceMeters(p, a);

        double t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        double projX = ax + t * dx;
        double projY = ay + t * dy;

        GpsPoint proj = GpsPoint.builder().latitude(projY).longitude(projX).build();
        return GeoUtils.distanceMeters(p, proj);
    }
}
