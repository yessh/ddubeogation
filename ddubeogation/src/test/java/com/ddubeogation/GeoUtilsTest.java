package com.ddubeogation;

import com.ddubeogation.model.GpsPoint;
import com.ddubeogation.util.GeoUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class GeoUtilsTest {

    @Test
    @DisplayName("같은 좌표 간 거리는 0")
    void samePointDistance() {
        GpsPoint p = point(37.5665, 126.9780);
        assertThat(GeoUtils.distanceMeters(p, p)).isEqualTo(0.0);
    }

    @Test
    @DisplayName("서울 시청 → 광화문 약 600m")
    void seoulCityHallToGwanghwamun() {
        GpsPoint cityHall   = point(37.5665, 126.9780);
        GpsPoint gwanghwamun = point(37.5759, 126.9769);
        double dist = GeoUtils.distanceMeters(cityHall, gwanghwamun);
        assertThat(dist).isBetween(900.0, 1100.0);
    }

    @Test
    @DisplayName("북쪽(0°) 방위각 계산")
    void bearingNorth() {
        GpsPoint from = point(37.0, 127.0);
        GpsPoint to   = point(37.1, 127.0); // 정북
        double bearing = GeoUtils.bearingDegrees(from, to);
        assertThat(bearing).isCloseTo(0.0, within(1.0));
    }

    @Test
    @DisplayName("동쪽(90°) 방위각 계산")
    void bearingEast() {
        GpsPoint from = point(37.0, 127.0);
        GpsPoint to   = point(37.0, 127.1); // 정동
        double bearing = GeoUtils.bearingDegrees(from, to);
        assertThat(bearing).isCloseTo(90.0, within(1.0));
    }

    @Test
    @DisplayName("bearingDelta: 350° → 10°는 +20°")
    void bearingDeltaWraparound() {
        double delta = GeoUtils.bearingDelta(350.0, 10.0);
        assertThat(delta).isCloseTo(20.0, within(0.001));
    }

    @Test
    @DisplayName("bearingDelta: 10° → 350°는 -20°")
    void bearingDeltaWraparoundNegative() {
        double delta = GeoUtils.bearingDelta(10.0, 350.0);
        assertThat(delta).isCloseTo(-20.0, within(0.001));
    }

    @Test
    @DisplayName("relativePosition: 정면 판별")
    void relativeAhead() {
        String pos = GeoUtils.relativePosition(90.0, 100.0); // 10° 차이
        assertThat(pos).isEqualTo("ahead");
    }

    @Test
    @DisplayName("relativePosition: 오른쪽 판별")
    void relativeRight() {
        String pos = GeoUtils.relativePosition(90.0, 180.0); // 90° 오른쪽
        assertThat(pos).isEqualTo("right");
    }

    private GpsPoint point(double lat, double lon) {
        return GpsPoint.builder().latitude(lat).longitude(lon).build();
    }
}
