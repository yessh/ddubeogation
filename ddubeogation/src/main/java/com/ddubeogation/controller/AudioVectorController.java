package com.ddubeogation.controller;

import com.ddubeogation.model.AudioDirective;
import com.ddubeogation.service.AudioVectorService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 클라이언트가 Head Tracker 데이터를 실시간 전송하여
 * 3D 오디오 파라미터만 단독으로 요청하는 경량 엔드포인트.
 *
 * NavigationController /update에서 통합 호출도 가능하지만,
 * 오디오 렌더링 루프(20ms)와 위치 업데이트 루프(50ms)를 분리하기 위해 제공.
 */
@RestController
@RequestMapping("/api/v1/audio")
@RequiredArgsConstructor
public class AudioVectorController {

    private final AudioVectorService audioVectorService;

    /**
     * GET /api/v1/audio/vector
     *   ?userBearing=180.0    현재 사용자(머리) 방향 (도)
     *   &targetBearing=225.0  목표 방향 (도)
     *   &noiseDb=72           주변 소음 (dB)
     */
    @GetMapping("/vector")
    public AudioDirective getAudioVector(
            @RequestParam double userBearing,
            @RequestParam double targetBearing,
            @RequestParam(defaultValue = "50") int noiseDb) {

        return audioVectorService.compute(userBearing, targetBearing, noiseDb);
    }
}
