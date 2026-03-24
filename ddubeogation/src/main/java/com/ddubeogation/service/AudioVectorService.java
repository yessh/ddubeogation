package com.ddubeogation.service;

import com.ddubeogation.model.AudioDirective;
import com.ddubeogation.util.GeoUtils;
import org.springframework.stereotype.Service;

/**
 * 3D 공간 음향 벡터를 계산한다.
 *
 * 핵심 공식:
 *   θ = targetBearing - userBearing  (−180 ~ +180)
 *   pitch(Hz) = 300 + (|θ| / 90) × 200      (정면=300Hz, 90°=500Hz, 한계=600Hz)
 *   pan       = sign(θ) × (|θ| / 180)        (−1.0 ~ +1.0)
 */
@Service
public class AudioVectorService {

    private static final double BASE_PITCH_HZ  = 300.0;
    private static final double PITCH_RANGE_HZ = 200.0;
    private static final double MAX_PITCH_HZ   = 600.0;

    private static final int NOISE_THRESHOLD_MODERATE = 60;
    private static final int NOISE_THRESHOLD_HIGH      = 75;
    private static final int NOISE_THRESHOLD_EXTREME   = 85;

    public AudioDirective compute(
            double userBearing,
            double targetBearing,
            int    noiseDb) {

        double theta = GeoUtils.bearingDelta(userBearing, targetBearing);

        double pitch  = computePitch(theta);
        double pan    = computePan(theta);
        String beepPattern = selectBeepPattern(theta);

        // 소음에 따른 음성/햅틱 모드 결정
        boolean voiceEnabled = noiseDb < NOISE_THRESHOLD_EXTREME;
        boolean hapticOnly   = noiseDb >= NOISE_THRESHOLD_EXTREME;
        double  volume       = computeVolume(noiseDb);
        int     haptic       = computeHapticIntensity(noiseDb, theta);

        return AudioDirective.builder()
            .pitchHz(pitch)
            .stereoPan(pan)
            .volumeMultiplier(volume)
            .hapticIntensity(haptic)
            .thetaDegrees(theta)
            .beepPattern(beepPattern)
            .voiceEnabled(voiceEnabled)
            .hapticOnly(hapticOnly)
            .build();
    }

    /**
     * 정면(0°) = 300Hz, 90° 이탈 = 500Hz
     * 오차가 클수록 높은 피치 → 귀가 방향을 직관적으로 인식
     */
    private double computePitch(double theta) {
        double pitch = BASE_PITCH_HZ + (Math.abs(theta) / 90.0) * PITCH_RANGE_HZ;
        return Math.min(pitch, MAX_PITCH_HZ);
    }

    /**
     * -1.0(완전 왼쪽) ~ 0.0(정면) ~ +1.0(완전 오른쪽)
     * HRTF 엔진(FMOD 등)에 전달되어 입체음향으로 렌더링됨
     */
    private double computePan(double theta) {
        return Math.signum(theta) * (Math.abs(theta) / 180.0);
    }

    /**
     * 방향 오차에 따른 비프 패턴
     *   0~15°  : 없음 (정상 진행)
     *   16~45° : 단음 경고
     *   46~90° : 이중음 (방향 교정 필요)
     *   90°+   : 삼중음 (크게 이탈)
     */
    private String selectBeepPattern(double theta) {
        double abs = Math.abs(theta);
        if (abs <= 15)  return "none";
        if (abs <= 45)  return "single";
        if (abs <= 90)  return "double";
        return "triple";
    }

    /**
     * 소음 레벨에 따른 출력 볼륨 배수
     * 75dB 이상 대로변에서는 자동 +boost
     */
    private double computeVolume(int noiseDb) {
        if (noiseDb < NOISE_THRESHOLD_MODERATE) return 0.7;
        if (noiseDb < NOISE_THRESHOLD_HIGH)      return 0.85;
        if (noiseDb < NOISE_THRESHOLD_EXTREME)   return 1.0; // 최대
        return 1.0; // 햅틱 전용이지만 볼륨도 최대 유지
    }

    /**
     * 진동 강도: 소음이 클수록 강하게, 방향 이탈이 클수록 강하게
     */
    private int computeHapticIntensity(int noiseDb, double theta) {
        double noiseWeight    = Math.min(1.0, noiseDb / 85.0);
        double directionWeight = Math.min(1.0, Math.abs(theta) / 90.0);
        double combined       = 0.5 * noiseWeight + 0.5 * directionWeight;
        return (int) (combined * 255);
    }
}
