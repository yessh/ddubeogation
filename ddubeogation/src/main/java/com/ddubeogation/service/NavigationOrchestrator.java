package com.ddubeogation.service;

import com.ddubeogation.client.OsrmClient;
import com.ddubeogation.model.*;
import com.ddubeogation.util.GeoUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * 내비게이션 파이프라인의 진입점.
 *
 * 1. GPS 보정 (Kalman + Map-Match)
 * 2. 경로 스텝 결정
 * 3. 컨텍스트 수집 (POI + 고도) — 병렬
 * 4. LLM 안내 문구 생성
 * 5. 3D 오디오 벡터 계산
 * 6. 통합 응답 반환
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NavigationOrchestrator {

    private final KalmanGpsFilterService  kalmanFilter;
    private final OsrmClient              osrmClient;
    private final RouteService            routeService;
    private final ContextBuilderService   contextBuilder;
    private final GuidanceGenerationService guidanceGen;
    private final AudioVectorService      audioVector;

    public Mono<NavigationResponse> process(NavigationRequest req) {
        String sessionId = req.getSessionId();

        // ── 1. GPS 보정 ────────────────────────────────────────────
        GpsPoint corrected = kalmanFilter.filter(
            sessionId, req.getRawGps(), req.getImu(), req.getBarometerAltitude()
        );

        // HDOP가 나쁜 구간에서 Map-Matching 수행
        Mono<GpsPoint> posMono = (corrected.getHdop() > 3.0)
            ? osrmClient.snapToRoad(corrected)
            : Mono.just(corrected);

        return posMono.flatMap(pos -> {

            // ── 2. 도착 여부 확인 ──────────────────────────────────
            if (routeService.hasArrived(sessionId, pos)) {
                return buildArrivalResponse(pos, sessionId);
            }

            // ── 3. 현재 스텝 결정 ─────────────────────────────────
            return routeService.getCurrentStep(sessionId, pos)
                .flatMap(step -> {

                    double distToDest = routeService.getDistanceToDestination(sessionId, pos);

                    // ── 4. 컨텍스트 수집 (POI + 고도) — 비동기 ────
                    return contextBuilder.build(pos, step, req.getAmbientNoiseDb(), distToDest)
                        .flatMap(ctx -> {

                            // ── 5. LLM 안내 문구 생성 ────────────
                            return guidanceGen.generate(ctx)
                                .map(script -> {

                                    // ── 6. 3D 오디오 벡터 계산 ──────
                                    double targetBearing = step.getTargetBearing();
                                    double userBearing   = req.getImu().getHeadingDegrees();
                                    // Head Tracker가 있으면 headBearing 우선 사용
                                    if (req.getHeadBearing() > 0) {
                                        userBearing = req.getHeadBearing();
                                    }

                                    AudioDirective audio = audioVector.compute(
                                        userBearing, targetBearing, req.getAmbientNoiseDb()
                                    );

                                    log.debug("[Orchestrator] session={} step={} θ={}° noise={}dB",
                                        sessionId, step.getDirection(),
                                        audio.getThetaDegrees(), req.getAmbientNoiseDb());

                                    return NavigationResponse.builder()
                                        .correctedPosition(pos)
                                        .guidance(script)
                                        .audioDirective(audio)
                                        .currentStep(step)
                                        .distanceToDestination(distToDest)
                                        .arrived(false)
                                        .sessionId(sessionId)
                                        .build();
                                });
                        });
                })
                // 경로 데이터 없을 때 기본 응답
                .switchIfEmpty(buildNoRouteResponse(pos, sessionId));
        });
    }

    private Mono<NavigationResponse> buildArrivalResponse(GpsPoint pos, String sessionId) {
        GuidanceScript arrivalScript = GuidanceScript.builder()
            .text("도착했어요. 고개를 드세요.")
            .shortText("도착")
            .generatedAt(System.currentTimeMillis())
            .build();

        AudioDirective quietAudio = AudioDirective.builder()
            .pitchHz(300.0)
            .stereoPan(0.0)
            .volumeMultiplier(0.5)
            .hapticIntensity(200)
            .thetaDegrees(0.0)
            .beepPattern("none")
            .voiceEnabled(true)
            .hapticOnly(false)
            .build();

        routeService.clearSession(sessionId);
        kalmanFilter.clearSession(sessionId);

        return Mono.just(NavigationResponse.builder()
            .correctedPosition(pos)
            .guidance(arrivalScript)
            .audioDirective(quietAudio)
            .arrived(true)
            .sessionId(sessionId)
            .build());
    }

    private Mono<NavigationResponse> buildNoRouteResponse(GpsPoint pos, String sessionId) {
        GuidanceScript waitScript = GuidanceScript.builder()
            .text("잠깐, 위치를 다시 잡고 있어요.")
            .shortText("대기중")
            .generatedAt(System.currentTimeMillis())
            .build();

        return Mono.just(NavigationResponse.builder()
            .correctedPosition(pos)
            .guidance(waitScript)
            .arrived(false)
            .sessionId(sessionId)
            .build());
    }
}
