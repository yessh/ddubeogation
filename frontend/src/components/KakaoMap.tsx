import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useKakaoSdk } from '../hooks/useKakaoSdk';
import type { GpsPoint } from '../types/navigation';

interface Props {
  origin: [number, number] | null;
  destination: [number, number] | null;
  currentPosition: GpsPoint | null;
  routeVertexes: number[];
  pickMode: 'origin' | 'destination' | null;
  onLocationPicked: (lat: number, lon: number, address: string) => void;
}

const DEFAULT_CENTER: [number, number] = [37.5665, 126.978];

// Colored SVG marker as data URL
function makeMarkerSvg(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.941 14 26 14 26S28 23.941 28 14C28 6.268 21.732 0 14 0z" fill="${color}"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
    <text x="14" y="18" text-anchor="middle" font-size="9" font-family="sans-serif" font-weight="bold" fill="${color}">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const ORIGIN_ICON_SRC = makeMarkerSvg('#22c55e', '출');
const DEST_ICON_SRC = makeMarkerSvg('#ef4444', '도');
const CUR_ICON_SRC = makeMarkerSvg('#3b82f6', '현');

export const KakaoMap = React.memo(function KakaoMap({
  origin,
  destination,
  currentPosition,
  routeVertexes,
  pickMode,
  onLocationPicked,
}: Props) {
  const sdkLoaded = useKakaoSdk();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const originMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const destMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const curMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const routeLineRef = useRef<kakao.maps.Polyline | null>(null);
  const clickHandlerRef = useRef<((e: kakao.maps.MapMouseEvent) => void) | null>(null);

  const onLocationPickedRef = useRef(onLocationPicked);
  useEffect(() => { onLocationPickedRef.current = onLocationPicked; }, [onLocationPicked]);

  // Initialize map
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || mapRef.current) return;
    const center = new kakao.maps.LatLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    mapRef.current = new kakao.maps.Map(containerRef.current, { center, level: 5 });
    setMapReady(true);
  }, [sdkLoaded]);

  const makeMarker = useCallback((iconSrc: string, title: string): kakao.maps.MarkerImage => {
    return new kakao.maps.MarkerImage(
      iconSrc,
      new kakao.maps.Size(28, 40),
      { offset: new kakao.maps.Point(14, 40) }
    );
    void title;
  }, []);

  // Click handler for pick mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (clickHandlerRef.current) {
      kakao.maps.event.removeListener(map, 'click', clickHandlerRef.current);
      clickHandlerRef.current = null;
    }

    if (pickMode) {
      const handler = (e: kakao.maps.MapMouseEvent) => {
        const lat = e.latLng.getLat();
        const lng = e.latLng.getLng();
        // Reverse geocode
        try {
          const geocoder = new kakao.maps.services.Geocoder();
          geocoder.coord2Address(lng, lat, (result, status) => {
            const address =
              status === 'OK' && result[0]
                ? (result[0].road_address?.address_name ?? result[0].address.address_name)
                : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            onLocationPickedRef.current(lat, lng, address);
          });
        } catch {
          onLocationPickedRef.current(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
      };
      clickHandlerRef.current = handler;
      kakao.maps.event.addListener(map, 'click', handler);
    }

    return () => {
      if (map && clickHandlerRef.current) {
        kakao.maps.event.removeListener(map, 'click', clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
    };
  }, [pickMode, mapReady]);

  // Cursor style
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Origin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (origin) {
      const pos = new kakao.maps.LatLng(origin[0], origin[1]);
      if (originMarkerRef.current) {
        originMarkerRef.current.setPosition(pos);
      } else {
        originMarkerRef.current = new kakao.maps.Marker({
          position: pos,
          map,
          image: makeMarker(ORIGIN_ICON_SRC, '출발'),
          title: '출발',
          zIndex: 3,
        });
      }
    } else {
      originMarkerRef.current?.setMap(null);
      originMarkerRef.current = null;
    }
  }, [origin, mapReady, makeMarker]);

  // Destination marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (destination) {
      const pos = new kakao.maps.LatLng(destination[0], destination[1]);
      if (destMarkerRef.current) {
        destMarkerRef.current.setPosition(pos);
      } else {
        destMarkerRef.current = new kakao.maps.Marker({
          position: pos,
          map,
          image: makeMarker(DEST_ICON_SRC, '목적지'),
          title: '목적지',
          zIndex: 3,
        });
      }
    } else {
      destMarkerRef.current?.setMap(null);
      destMarkerRef.current = null;
    }
  }, [destination, mapReady, makeMarker]);

  // Current position marker (auto-pan)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (currentPosition) {
      const pos = new kakao.maps.LatLng(currentPosition.latitude, currentPosition.longitude);
      if (curMarkerRef.current) {
        curMarkerRef.current.setPosition(pos);
      } else {
        curMarkerRef.current = new kakao.maps.Marker({
          position: pos,
          map,
          image: makeMarker(CUR_ICON_SRC, '현재'),
          title: '현재 위치',
          zIndex: 5,
        });
      }
      map.setCenter(pos);
    } else {
      curMarkerRef.current?.setMap(null);
      curMarkerRef.current = null;
    }
  }, [currentPosition, mapReady, makeMarker]);

  // Route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    routeLineRef.current?.setMap(null);
    routeLineRef.current = null;

    if (routeVertexes.length >= 4) {
      const path: kakao.maps.LatLng[] = [];
      for (let i = 0; i + 1 < routeVertexes.length; i += 2) {
        // vertexes are [lon, lat, lon, lat, ...]
        path.push(new kakao.maps.LatLng(routeVertexes[i + 1], routeVertexes[i]));
      }
      routeLineRef.current = new kakao.maps.Polyline({
        path,
        strokeWeight: 6,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.85,
        map,
      });

      // Fit bounds to route
      const bounds = new kakao.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      if (!bounds.isEmpty()) {
        map.setBounds(bounds, 60, 60, 60, 60);
      }
    }
  }, [routeVertexes, mapReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!sdkLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">카카오맵 불러오는 중...</p>
          {!import.meta.env.VITE_KAKAO_JS_KEY && (
            <p className="text-red-400 text-xs text-center px-8">
              .env 파일에 VITE_KAKAO_JS_KEY 를 설정해주세요
            </p>
          )}
        </div>
      )}
      {pickMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-black/75 text-white text-sm px-5 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
            {pickMode === 'origin' ? '📍 출발지를 지도에서 클릭하세요' : '🏁 목적지를 지도에서 클릭하세요'}
          </div>
        </div>
      )}
    </div>
  );
});
