import { useState, useCallback, useRef, useEffect } from 'react';
import { KakaoMap } from './components/KakaoMap';
import { GuidanceDisplay } from './components/GuidanceDisplay';
import { LocationInput } from './components/LocationInput';
import { useNavigationSession } from './hooks/useNavigationSession';
import { useNavigationNotifications } from './hooks/useNavigationNotifications';
import { useKakaoSdk } from './hooks/useKakaoSdk';
import { startNavigation, endNavigation } from './api/navigation';
import { fetchRoute } from './api/directions';
import { enrichGuidesWithLandmarks } from './api/landmarks';
import type { NavigationRequest, SessionStatus, SimState } from './types/navigation';
import type { DirectionResult } from './api/directions';

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
}

function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function movePosition(lat: number, lon: number, bearing: number, meters: number): [number, number] {
  const R = 6371000;
  const d = meters / R;
  const brng = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 =
    lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

const DEFAULT_SIM_STATE: SimState = {
  lat: 37.5665,
  lon: 126.978,
  altitude: 30,
  hdop: 1.5,
  bearing: 0,
  headBearing: 0,
  stepCount: 0,
  stepLengthMeters: 0.75,
  simulateWalk: false,
};

const statusColor: Record<SessionStatus, string> = {
  idle: 'bg-gray-500',
  active: 'bg-green-500 animate-pulse',
  arrived: 'bg-blue-500',
  error: 'bg-red-500',
};
const statusLabel: Record<SessionStatus, string> = {
  idle: '대기',
  active: '안내 중',
  arrived: '도착',
  error: '오류',
};

type PickMode = 'origin' | 'destination' | null;

export default function App() {
  const sdkLoaded = useKakaoSdk();
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [originAddress, setOriginAddress] = useState('');
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [destAddress, setDestAddress] = useState('');
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [routeData, setRouteData] = useState<DirectionResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [simState, setSimState] = useState<SimState>(DEFAULT_SIM_STATE);
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [followGps, setFollowGps] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [rerouteNotice, setRerouteNotice] = useState(false);
  const setupOrientationRef = useRef<(() => void) | null>(null);
  const gpsInitRef = useRef(false);

  // suppress unused-var warning on setSessionId while keeping reset capability
  void setSessionId;

  const destRef = useRef({ lat: 0, lon: 0 });
  useEffect(() => {
    if (destination) destRef.current = { lat: destination[0], lon: destination[1] };
  }, [destination]);

  // 나침반 방향 (DeviceOrientation)
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const webkitHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (webkitHeading != null) {
        setHeading(webkitHeading);
      } else if (e.alpha != null) {
        setHeading((360 - e.alpha + 360) % 360);
      }
    };

    const setup = () => {
      window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
    };

    const isIOS =
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function';

    if (!isIOS) {
      setup();
    } else {
      setupOrientationRef.current = setup;
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, []);

  // GPS watchPosition: 실시간 위치 추적
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        setGpsPosition([lat, lon]);
        setGpsAccuracy(accuracy);
        // 첫 GPS 수신 시 simState 초기화 + 출발지 설정
        if (!gpsInitRef.current) {
          gpsInitRef.current = true;
          setSimState((prev) => ({ ...prev, lat, lon }));
          if (sdkLoaded) {
            try {
              const geocoder = new kakao.maps.services.Geocoder();
              geocoder.coord2Address(lon, lat, (results, gStatus) => {
                let address = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                if (gStatus === 'OK' && results[0]) {
                  address =
                    results[0].road_address?.address_name ??
                    results[0].address.address_name;
                }
                setOrigin([lat, lon]);
                setOriginAddress(address);
                setPickMode(null);
              });
            } catch {
              setOrigin([lat, lon]);
              setOriginAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            }
          }
        }
        // 안내 중이 아닐 때 simState 위치 동기화 (도보 시뮬레이션 중이 아닐 때)
        setSimState((prev) => {
          if (prev.simulateWalk) return prev;
          return { ...prev, lat, lon };
        });
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded]);

  // GPS 버튼: 현재 GPS 위치를 출발지로 설정
  const doGetGPS = useCallback(() => {
    if (!gpsPosition || !sdkLoaded) return;
    const [lat, lon] = gpsPosition;
    try {
      const geocoder = new kakao.maps.services.Geocoder();
      geocoder.coord2Address(lon, lat, (results, gStatus) => {
        let address = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if (gStatus === 'OK' && results[0]) {
          address =
            results[0].road_address?.address_name ??
            results[0].address.address_name;
        }
        setOrigin([lat, lon]);
        setOriginAddress(address);
        setPickMode(null);
      });
    } catch {
      setOrigin([lat, lon]);
      setOriginAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    }
  }, [gpsPosition, sdkLoaded]);

  const simStateRef = useRef(simState);
  useEffect(() => { simStateRef.current = simState; }, [simState]);

  const walkTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (simState.simulateWalk) {
      walkTickRef.current = setInterval(() => {
        const s = simStateRef.current;
        const d = destRef.current;
        const brng = bearingTo(s.lat, s.lon, d.lat, d.lon);
        const [newLat, newLon] = movePosition(s.lat, s.lon, brng, 1.4 * 0.05);
        setSimState((prev) => ({
          ...prev,
          lat: newLat,
          lon: newLon,
          bearing: brng,
          headBearing: brng,
          stepCount: prev.stepCount + 1,
        }));
      }, 50);
    } else {
      if (walkTickRef.current) clearInterval(walkTickRef.current);
    }
    return () => { if (walkTickRef.current) clearInterval(walkTickRef.current); };
  }, [simState.simulateWalk]);

  const getRequest = useCallback((): NavigationRequest => {
    const s = simStateRef.current;
    const now = Date.now();
    return {
      sessionId,
      rawGps: {
        latitude: s.lat, longitude: s.lon, altitude: s.altitude,
        accuracy: s.hdop * 3, hdop: s.hdop, bearing: s.bearing,
        timestamp: now, mapMatched: false,
      },
      imu: {
        accelX: 0, accelY: 0, accelZ: 9.81,
        gyroX: 0, gyroY: 0, gyroZ: 0,
        magX: 0, magY: 0, magZ: 0,
        stepCount: s.stepCount, stepLengthMeters: s.stepLengthMeters,
        headingDegrees: s.bearing, timestamp: now,
      },
      barometerAltitude: s.altitude,
      headBearing: s.headBearing,
      destinationId: `${destRef.current.lat},${destRef.current.lon}`,
    };
  }, [sessionId]);

  const isSessionActive = status === 'active';
  const { lastResponse, startPolling, stopPolling } =
    useNavigationSession(sessionId, getRequest, isSessionActive);

  useNavigationNotifications(lastResponse ?? null, routeData?.guides ?? []);

  useEffect(() => {
    if (lastResponse?.arrived && status === 'active') {
      setStatus('arrived');
      stopPolling();
    }
  }, [lastResponse, status, stopPolling]);

  const doFetchRoute = useCallback(async (orig: [number, number], dest: [number, number]) => {
    setRouteLoading(true);
    setRouteData(null);
    try {
      const result = await fetchRoute(orig[0], orig[1], dest[0], dest[1]);
      setRouteData(result);
      // Enrich turn points with nearby landmark names in the background
      if (result) {
        void enrichGuidesWithLandmarks(result.guides).then((enrichedGuides) => {
          setRouteData({ ...result, guides: enrichedGuides });
        });
      }
    } finally {
      setRouteLoading(false);
    }
  }, []);

  // 경로 이탈 후 재탐색 감지 → 지도 경로 업데이트
  useEffect(() => {
    if (!lastResponse?.rerouted || !destination) return;
    const currentPos = gpsPosition ?? (simState ? [simState.lat, simState.lon] as [number, number] : null);
    if (!currentPos) return;
    setRerouteNotice(true);
    void doFetchRoute(currentPos, destination);
    const timer = setTimeout(() => setRerouteNotice(false), 3000);
    return () => clearTimeout(timer);
  }, [lastResponse?.rerouted, destination, gpsPosition, simState, doFetchRoute]);

  // Called when user selects origin via search or GPS
  const handleSelectOrigin = useCallback(
    (lat: number, lon: number, address: string) => {
      const newOrigin: [number, number] = [lat, lon];
      setOrigin(newOrigin);
      setOriginAddress(address);
      setPickMode(null);
      setRouteData(null);
      if (destination) void doFetchRoute(newOrigin, destination);
    },
    [destination, doFetchRoute]
  );

  // Called when user selects destination via search
  const handleSelectDestination = useCallback(
    (lat: number, lon: number, address: string) => {
      const newDest: [number, number] = [lat, lon];
      setDestination(newDest);
      setDestAddress(address);
      setPickMode(null);
      if (origin) void doFetchRoute(origin, newDest);
    },
    [origin, doFetchRoute]
  );

  // Called when user clicks on the map in pick mode
  const handleLocationPicked = useCallback(
    (lat: number, lon: number, address: string) => {
      if (pickMode === 'origin') {
        setOrigin([lat, lon]);
        setOriginAddress(address);
        setPickMode('destination'); // auto-advance to destination pick
        setRouteData(null);
      } else if (pickMode === 'destination') {
        const newDest: [number, number] = [lat, lon];
        setDestination(newDest);
        setDestAddress(address);
        setPickMode(null);
        if (origin) void doFetchRoute(origin, newDest);
      }
    },
    [pickMode, origin, doFetchRoute]
  );

  const handleStart = async () => {
    if (!origin || !destination) return;
    await startNavigation({
      sessionId,
      originLat: origin[0], originLon: origin[1],
      destLat: destination[0], destLon: destination[1],
    });
    setSimState((prev) => ({ ...prev, lat: origin[0], lon: origin[1] }));
    setStatus('active');
    startPolling();
  };

  const handleEnd = async () => {
    await endNavigation(sessionId);
    setStatus('idle');
    stopPolling();
  };

  const handleReset = () => {
    setOrigin(null);
    setOriginAddress('');
    setDestination(null);
    setDestAddress('');
    setRouteData(null);
    setPickMode('origin');
    setStatus('idle');
  };

  const handleRecenter = useCallback(async () => {
    setRecenterKey((k) => k + 1);
    setFollowGps(true);
    if (setupOrientationRef.current) {
      try {
        const perm = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (perm === 'granted') {
          setupOrientationRef.current();
          setupOrientationRef.current = null;
        }
      } catch {
        setupOrientationRef.current = null;
      }
    }
  }, []);

  const canStart = !!origin && !!destination && status === 'idle';

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-900 overflow-hidden">
      {/* ── Full-screen map ── */}
      <div className="absolute inset-0">
        <KakaoMap
          origin={origin}
          destination={destination}
          gpsPosition={gpsPosition}
          gpsAccuracy={gpsAccuracy}
          routeVertexes={routeData?.vertexes ?? []}
          pickMode={status === 'idle' ? pickMode : null}
          onLocationPicked={handleLocationPicked}
          heading={heading}
          followGps={followGps}
          recenterKey={recenterKey}
          onUserPan={() => setFollowGps(false)}
        />
      </div>

      {/* ── Top overlay ── */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-900/85 backdrop-blur-md pointer-events-auto">
          <span className="text-lg">🦯</span>
          <h1 className="text-white font-bold text-sm">뚜벅이션</h1>
          <div className={`w-2 h-2 rounded-full ${statusColor[status]}`} />
          <span className="text-gray-400 text-xs">{statusLabel[status]}</span>
          <div className="ml-auto flex gap-1.5">
            {(origin || destination) && status === 'idle' && (
              <button
                onClick={handleReset}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded bg-gray-700/60"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* Route selection card (idle) */}
        {status === 'idle' && (
          <div className="mx-3 mt-2 bg-white/95 rounded-2xl shadow-xl p-3 space-y-2 pointer-events-auto">
            {/* Origin */}
            <LocationInput
              label="출발지"
              color="green"
              value={originAddress}
              isPickMode={pickMode === 'origin'}
              onActivatePickMode={() => setPickMode('origin')}
              onSelect={handleSelectOrigin}
              onGetGPS={doGetGPS}
              gpsLoading={!gpsPosition}
            />

            {/* Divider */}
            <div className="flex items-center gap-3 px-3">
              <div className="w-3 flex justify-center">
                <div className="w-0.5 h-3 bg-gray-300" />
              </div>
              <div className="flex-1 border-t border-dashed border-gray-200" />
            </div>

            {/* Destination */}
            <LocationInput
              label="목적지"
              color="red"
              value={destAddress}
              isPickMode={pickMode === 'destination'}
              onActivatePickMode={() => setPickMode('destination')}
              onSelect={handleSelectDestination}
              userLocation={gpsPosition ?? undefined}
            />

            {/* Route status */}
            {routeLoading && (
              <div className="flex items-center gap-2 px-3 py-1 text-blue-600 text-xs">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                도보 경로 탐색 중...
              </div>
            )}
            {routeData && !routeLoading && (
              <div className="px-3 py-1.5 bg-green-50 rounded-xl">
                <p className="text-green-600 text-xs font-medium mb-1">✓ 도보 경로 탐색 완료</p>
                <div className="flex gap-3 text-xs text-gray-600">
                  <span>🚶 {formatDistance(routeData.totalDistanceMeters)}</span>
                  <span>⏱ 약 {formatDuration(routeData.totalDurationSeconds)}</span>
                </div>
              </div>
            )}

            {/* Start button */}
            {canStart && (
              <button
                onClick={() => void handleStart()}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold rounded-xl py-3 transition-colors shadow"
              >
                경로 안내 시작
              </button>
            )}
          </div>
        )}

        {/* Active nav: compact bar */}
        {status === 'active' && (
          <div className="mx-3 mt-2 flex items-center gap-3 bg-gray-900/90 backdrop-blur-md rounded-xl px-4 py-2.5 shadow-xl pointer-events-auto">
            {rerouteNotice ? (
              <span className="text-yellow-400 text-xs font-medium shrink-0 animate-pulse">경로 재탐색됨</span>
            ) : (
              <span className="text-green-400 text-xs font-medium shrink-0">안내 중</span>
            )}
            <span className="text-gray-300 text-xs truncate flex-1">→ {destAddress || '목적지'}</span>
            <button
              onClick={() => void handleEnd()}
              className="text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-900/60 shrink-0"
            >
              종료
            </button>
          </div>
        )}

        {/* Arrived banner */}
        {status === 'arrived' && (
          <div className="mx-3 mt-2 bg-blue-600/90 backdrop-blur-md rounded-xl px-4 py-3 text-center text-white font-bold shadow-xl pointer-events-auto">
            🎉 목적지에 도착했습니다!
            <button
              onClick={handleReset}
              className="ml-3 text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full font-normal"
            >
              새 경로
            </button>
          </div>
        )}
      </div>

      {/* ── 현재 위치 버튼 (우측 하단) ── */}
      <div className="absolute bottom-6 right-4 z-30 pointer-events-auto">
        <button
          onClick={() => void handleRecenter()}
          className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors ${
            followGps ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'
          }`}
          title="현재 위치로"
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </button>
      </div>

      {/* ── Bottom overlay: guidance (active/arrived) ── */}
      {(status === 'active' || status === 'arrived') && lastResponse && (
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="mx-3 mb-3 pointer-events-auto">
            <GuidanceDisplay response={lastResponse} />
          </div>
        </div>
      )}

    </div>
  );
}
