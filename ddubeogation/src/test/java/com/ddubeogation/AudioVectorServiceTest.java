package com.ddubeogation;

import com.ddubeogation.model.AudioDirective;
import com.ddubeogation.service.AudioVectorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class AudioVectorServiceTest {

    private AudioVectorService service;

    @BeforeEach
    void setUp() {
        service = new AudioVectorService();
    }

    @Test
    @DisplayName("정면 진행 시 기준 피치(300Hz)와 중앙 패닝")
    void straightAhead() {
        AudioDirective dir = service.compute(90.0, 90.0, 50);
        assertThat(dir.getPitchHz()).isEqualTo(300.0);
        assertThat(dir.getStereoPan()).isEqualTo(0.0);
        assertThat(dir.getBeepPattern()).isEqualTo("none");
    }

    @Test
    @DisplayName("90° 오른쪽 이탈 시 피치 500Hz, 패닝 +0.5")
    void rightDeviation90Degrees() {
        AudioDirective dir = service.compute(0.0, 90.0, 50);
        assertThat(dir.getPitchHz()).isEqualTo(500.0);
        assertThat(dir.getStereoPan()).isCloseTo(0.5, within(0.001));
        assertThat(dir.getThetaDegrees()).isCloseTo(90.0, within(0.001));
    }

    @Test
    @DisplayName("90° 왼쪽 이탈 시 패닝 음수")
    void leftDeviation() {
        AudioDirective dir = service.compute(90.0, 0.0, 50);
        assertThat(dir.getStereoPan()).isNegative();
        assertThat(dir.getThetaDegrees()).isNegative();
    }

    @Test
    @DisplayName("피치는 최대 600Hz를 초과하지 않는다")
    void pitchCap() {
        AudioDirective dir = service.compute(0.0, 180.0, 50); // 180° 이탈
        assertThat(dir.getPitchHz()).isLessThanOrEqualTo(600.0);
    }

    @Test
    @DisplayName("85dB 이상 극소음 시 hapticOnly=true, voiceEnabled=false")
    void extremeNoiseHapticOnly() {
        AudioDirective dir = service.compute(0.0, 0.0, 90);
        assertThat(dir.isHapticOnly()).isTrue();
        assertThat(dir.isVoiceEnabled()).isFalse();
    }

    @Test
    @DisplayName("60dB 이하 저소음 시 음성 활성화")
    void lowNoiseVoiceEnabled() {
        AudioDirective dir = service.compute(0.0, 0.0, 40);
        assertThat(dir.isVoiceEnabled()).isTrue();
        assertThat(dir.isHapticOnly()).isFalse();
    }

    @Test
    @DisplayName("180° 반전 방향의 bearingDelta 범위 확인")
    void bearingDeltaWraparound() {
        AudioDirective dir = service.compute(350.0, 10.0, 50); // 실제 θ = 20°
        assertThat(dir.getThetaDegrees()).isCloseTo(20.0, within(0.001));
    }

    @Test
    @DisplayName("비프 패턴: 46~90° 이탈 시 double")
    void beepPatternDouble() {
        AudioDirective dir = service.compute(0.0, 60.0, 50);
        assertThat(dir.getBeepPattern()).isEqualTo("double");
    }
}
