package com.ddubeogation.service;

import com.ddubeogation.model.GpsPoint;
import com.ddubeogation.model.ImuData;
import com.ddubeogation.util.GeoUtils;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.math3.filter.*;
import org.apache.commons.math3.linear.*;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

/**
 * 세션별 Kalman Filter를 유지하며 GPS + IMU 데이터를 융합한다.
 *
 * 상태 벡터: [lat, lon, vLat, vLon]
 * - lat, lon     : 위도/경도
 * - vLat, vLon   : 위도/경도 방향 속도 (도/초)
 */
@Slf4j
@Service
public class KalmanGpsFilterService {

    // dt: 보행자 업데이트 주기 (초)
    private static final double DT = 0.05;

    // 프로세스 노이즈: 보행 가속도 분산
    private static final double PROCESS_NOISE = 1e-5;

    // 측정 노이즈: GPS 측위 분산
    private static final double MEASURE_NOISE_GOOD = 5e-10;  // HDOP < 2
    private static final double MEASURE_NOISE_POOR = 5e-8;   // HDOP > 4

    // 세션별 필터 상태 저장
    private final Map<String, KalmanFilter> filterMap = new ConcurrentHashMap<>();
    private final Map<String, RealVector>   stateMap  = new ConcurrentHashMap<>();

    /**
     * 메인 GPS 보정 메서드
     * 1. HDOP 기반 측정 노이즈 동적 조정
     * 2. IMU Dead Reckoning과 Kalman 융합
     * 3. Map-Matching은 OsrmClient에 위임
     */
    public GpsPoint filter(String sessionId, GpsPoint raw, ImuData imu, double baroAltitude) {
        KalmanFilter kf = filterMap.computeIfAbsent(sessionId, k -> buildFilter(raw));

        // ── 예측 단계 ──────────────────────────────────────────
        // IMU Dead Reckoning으로 이동 벡터 계산
        double[] delta = deadReckoningDelta(imu);

        // 상태 전이 행렬 업데이트 (속도 반영)
        RealMatrix F = buildTransitionMatrix();
        RealVector predicted = F.operate(getState(sessionId, raw));
        predicted.addToEntry(0, delta[0]); // lat 보정
        predicted.addToEntry(1, delta[1]); // lon 보정

        // ── 업데이트 단계 ──────────────────────────────────────
        double measureNoise = selectMeasureNoise(raw.getHdop());
        RealMatrix R = MatrixUtils.createRealDiagonalMatrix(
            new double[]{measureNoise, measureNoise}
        );

        // GPS 관측값
        RealVector z = new ArrayRealVector(new double[]{raw.getLatitude(), raw.getLongitude()});

        // Kalman 업데이트 (H = 위치만 관측)
        RealMatrix H = buildObservationMatrix();
        RealMatrix P = getCovariance(sessionId);
        RealMatrix S = H.multiply(P).multiply(H.transpose()).add(R);
        RealMatrix K = P.multiply(H.transpose()).multiply(MatrixUtils.inverse(S));

        RealVector innovation = z.subtract(H.operate(predicted));
        RealVector updated    = predicted.add(K.operate(innovation));

        // 상태 저장
        stateMap.put(sessionId, updated);

        double filteredLat = updated.getEntry(0);
        double filteredLon = updated.getEntry(1);

        // 기압계로 고도 보정 (GPS 고도는 오차가 크므로 기압계 우선)
        double altitude = (baroAltitude > 0) ? baroAltitude : raw.getAltitude();

        log.debug("[Kalman] session={} raw=({:.6f},{:.6f}) filtered=({:.6f},{:.6f}) hdop={}",
            sessionId, raw.getLatitude(), raw.getLongitude(),
            filteredLat, filteredLon, raw.getHdop());

        return GpsPoint.builder()
            .latitude(filteredLat)
            .longitude(filteredLon)
            .altitude(altitude)
            .accuracy(estimateAccuracy(raw.getHdop()))
            .hdop(raw.getHdop())
            .bearing(imu.getHeadingDegrees())
            .timestamp(raw.getTimestamp())
            .mapMatched(false) // OSRM 스냅은 OsrmClient에서 처리
            .build();
    }

    /**
     * IMU Dead Reckoning: 보행 벡터 → 위도/경도 델타 계산
     */
    private double[] deadReckoningDelta(ImuData imu) {
        if (imu.getStepCount() <= 0) return new double[]{0.0, 0.0};

        double stepLen = imu.getStepLengthMeters() > 0 ? imu.getStepLengthMeters() : 0.75;
        double distM   = imu.getStepCount() * stepLen;
        double heading = Math.toRadians(imu.getHeadingDegrees());

        // 미터 → 위도/경도 도 단위 변환
        double dLat = (distM * Math.cos(heading)) / GeoUtils.latDegreeToMeters();
        double dLon = (distM * Math.sin(heading)) / GeoUtils.lonDegreeToMeters(imu.getHeadingDegrees());

        return new double[]{dLat, dLon};
    }

    private double selectMeasureNoise(double hdop) {
        if (hdop < 1.0) return MEASURE_NOISE_GOOD * 0.5;
        if (hdop < 2.0) return MEASURE_NOISE_GOOD;
        if (hdop < 4.0) return MEASURE_NOISE_GOOD * 10;
        return MEASURE_NOISE_POOR; // 골목 등 GPS 불량 구간 → IMU 비중 상승
    }

    private double estimateAccuracy(double hdop) {
        // 경험적: accuracy ≈ HDOP × 2.5m (수평 정밀도)
        return hdop * 2.5;
    }

    private RealMatrix buildTransitionMatrix() {
        // [lat, lon, vLat, vLon] 상태 전이
        return MatrixUtils.createRealMatrix(new double[][]{
            {1, 0, DT, 0 },
            {0, 1, 0,  DT},
            {0, 0, 1,  0 },
            {0, 0, 0,  1 }
        });
    }

    private RealMatrix buildObservationMatrix() {
        // GPS는 위치(lat, lon)만 관측
        return MatrixUtils.createRealMatrix(new double[][]{
            {1, 0, 0, 0},
            {0, 1, 0, 0}
        });
    }

    private KalmanFilter buildFilter(GpsPoint initialPos) {
        RealMatrix F = buildTransitionMatrix();
        RealMatrix H = buildObservationMatrix();
        RealMatrix Q = MatrixUtils.createRealIdentityMatrix(4).scalarMultiply(PROCESS_NOISE);
        RealMatrix R = MatrixUtils.createRealIdentityMatrix(2).scalarMultiply(MEASURE_NOISE_GOOD);
        RealMatrix P = MatrixUtils.createRealIdentityMatrix(4).scalarMultiply(1.0);
        RealVector x0 = new ArrayRealVector(
            new double[]{initialPos.getLatitude(), initialPos.getLongitude(), 0, 0}
        );
        ProcessModel  pm = new DefaultProcessModel(F, null, Q, x0, P);
        MeasurementModel mm = new DefaultMeasurementModel(H, R);
        return new KalmanFilter(pm, mm);
    }

    private RealVector getState(String sessionId, GpsPoint fallback) {
        return stateMap.computeIfAbsent(sessionId, k ->
            new ArrayRealVector(new double[]{
                fallback.getLatitude(), fallback.getLongitude(), 0, 0
            })
        );
    }

    private RealMatrix getCovariance(String sessionId) {
        // 초기 공분산은 항등행렬 — 이후 KF 내부에서 갱신됨
        KalmanFilter kf = filterMap.get(sessionId);
        if (kf == null) return MatrixUtils.createRealIdentityMatrix(4);
        return MatrixUtils.createRealMatrix(kf.getErrorCovariance());
    }

    public void clearSession(String sessionId) {
        filterMap.remove(sessionId);
        stateMap.remove(sessionId);
    }
}
