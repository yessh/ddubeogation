export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  hdop: number;
  bearing: number;
  timestamp: number;
  mapMatched: boolean;
}

export interface ImuData {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  magX: number;
  magY: number;
  magZ: number;
  stepCount: number;
  stepLengthMeters: number;
  headingDegrees: number;
  timestamp: number;
}

export interface StartRequest {
  sessionId: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
}

export interface NavigationRequest {
  sessionId: string;
  rawGps: GpsPoint;
  imu: ImuData;
  barometerAltitude: number;
  headBearing: number;
  destinationId: string;
}

export interface GuidanceScript {
  text: string;
  shortText: string;
  fromCache: boolean;
  cacheKey: string;
  generatedAt: number;
}

export interface RouteStep {
  direction: 'straight' | 'turn_right' | 'turn_left' | 'arrive';
  targetBearing: number;
  startPoint: GpsPoint;
  endPoint: GpsPoint;
  distanceMeters: number;
  streetName: string;
  isCrossing: boolean;
  sequenceIndex: number;
}

export interface NavigationResponse {
  correctedPosition: GpsPoint;
  guidance: GuidanceScript;
  currentStep: RouteStep;
  distanceToDestination: number;
  arrived: boolean;
  rerouted: boolean;
  sessionId: string;
}

export interface LogEntry {
  id: number;
  timestamp: number;
  type: 'nav-update' | 'start' | 'end';
  durationMs: number;
  status: number;
  error?: string;
}

export type SessionStatus = 'idle' | 'active' | 'arrived' | 'error';

export interface SimState {
  lat: number;
  lon: number;
  altitude: number;
  hdop: number;
  bearing: number;
  headBearing: number;
  stepCount: number;
  stepLengthMeters: number;
  simulateWalk: boolean;
}
