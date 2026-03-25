import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GpsPoint } from '../types/navigation';

// Fix Leaflet default icon paths in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

const SHADOW_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: SHADOW_URL,
  iconSize: [25, 41], iconAnchor: [12, 41],
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: SHADOW_URL,
  iconSize: [25, 41], iconAnchor: [12, 41],
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: SHADOW_URL,
  iconSize: [25, 41], iconAnchor: [12, 41],
});

function AutoPan({ position }: { position: [number, number] | null }) {
  const map = useMap();
  const prevRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!position) return;
    const prev = prevRef.current;
    if (!prev || Math.abs(prev[0] - position[0]) > 0.00005 || Math.abs(prev[1] - position[1]) > 0.00005) {
      map.panTo(position, { animate: true, duration: 0.3 });
      prevRef.current = position;
    }
  }, [map, position]);
  return null;
}

interface Props {
  origin: [number, number] | null;
  destination: [number, number] | null;
  currentPosition: GpsPoint | null;
  positionHistory: Array<[number, number]>;
}

const DEFAULT_CENTER: [number, number] = [37.5665, 126.9780];

export const MapView = React.memo(function MapView({ origin, destination, currentPosition, positionHistory }: Props) {
  const curPos: [number, number] | null = currentPosition
    ? [currentPosition.latitude, currentPosition.longitude]
    : null;

  const center = origin ?? curPos ?? DEFAULT_CENTER;

  return (
    <div className="rounded-xl overflow-hidden h-96 border border-gray-700">
      <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {origin && <Marker position={origin} icon={greenIcon} />}
        {destination && <Marker position={destination} icon={redIcon} />}
        {curPos && <Marker position={curPos} icon={blueIcon} />}
        {positionHistory.length > 1 && (
          <Polyline positions={positionHistory} color="#3b82f6" weight={3} opacity={0.7} />
        )}
        <AutoPan position={curPos} />
      </MapContainer>
    </div>
  );
});
