package com.ddubeogation.util;

import com.ddubeogation.model.GpsPoint;

public final class GeoUtils {

    private static final double EARTH_RADIUS_M = 6_371_000.0;

    private GeoUtils() {}

    /**
     * Haversine 공식으로 두 GPS 좌표 간 거리 계산 (m)
     */
    public static double distanceMeters(GpsPoint a, GpsPoint b) {
        double dLat = Math.toRadians(b.getLatitude()  - a.getLatitude());
        double dLon = Math.toRadians(b.getLongitude() - a.getLongitude());
        double sinDLat = Math.sin(dLat / 2);
        double sinDLon = Math.sin(dLon / 2);
        double c = sinDLat * sinDLat
                 + Math.cos(Math.toRadians(a.getLatitude()))
                 * Math.cos(Math.toRadians(b.getLatitude()))
                 * sinDLon * sinDLon;
        return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
    }

    /**
     * 두 GPS 좌표 간 방위각 계산 (도, 0=북, 시계방향)
     */
    public static double bearingDegrees(GpsPoint from, GpsPoint to) {
        double dLon = Math.toRadians(to.getLongitude() - from.getLongitude());
        double lat1 = Math.toRadians(from.getLatitude());
        double lat2 = Math.toRadians(to.getLatitude());
        double y = Math.sin(dLon) * Math.cos(lat2);
        double x = Math.cos(lat1) * Math.sin(lat2)
                 - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /**
     * 두 방위각의 차이 (-180 ~ +180)
     * 양수 = 오른쪽, 음수 = 왼쪽
     */
    public static double bearingDelta(double current, double target) {
        double delta = target - current;
        while (delta >  180) delta -= 360;
        while (delta < -180) delta += 360;
        return delta;
    }

    /**
     * POI 가 사용자 기준 왼쪽/오른쪽/정면 어디에 있는지 판별
     */
    public static String relativePosition(double userBearing, double poiBearing) {
        double delta = bearingDelta(userBearing, poiBearing);
        if (Math.abs(delta) <= 45)  return "ahead";
        if (delta > 45)             return "right";
        return "left";
    }

    /**
     * 위도 기준 1도의 미터 환산
     */
    public static double latDegreeToMeters() {
        return 111_320.0;
    }

    public static double lonDegreeToMeters(double lat) {
        return 111_320.0 * Math.cos(Math.toRadians(lat));
    }
}
