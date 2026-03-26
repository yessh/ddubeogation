# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Generate Gradle wrapper if missing
gradle wrapper

# Build
./gradlew build

# Run all tests
./gradlew test

# Run application (required env vars below)
./gradlew bootRun
```

**Required environment variables:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Claude API key
export REDIS_HOST=localhost            # Redis for guidance caching
export REDIS_PORT=6379
```

**Optional (defaults in application.yml):**
```bash
export OSRM_URL=http://router.project-osrm.org      # Route + map-matching
export OVERPASS_URL=https://overpass-api.de/api      # OSM POI queries
export ELEVATION_URL=https://api.open-elevation.com/api/v1
```

## Frontend (Demo UI)

Located at `../frontend/` (sibling of this `ddubeogation/` directory).

**Stack:** Vite + React 18 + TypeScript + Tailwind CSS + Leaflet

```bash
cd ../frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

> Vite dev server proxies `/api` → `http://localhost:8080` so the backend must be running on port 8080.

### Frontend Structure

```
frontend/src/
├── api/navigation.ts         # API client (startNavigation, updateNavigation, endNavigation)
├── types/navigation.ts       # TypeScript interfaces mirroring Java models
├── hooks/
│   └── useNavigationSession.ts  # 50ms polling loop (setInterval + AbortController)
└── components/
    ├── NavigationSetup.tsx      # Session lifecycle (sessionId, origin/dest coords, start/end)
    ├── MapView.tsx              # Leaflet map (origin/dest/current markers, position trail polyline)
    ├── GuidanceDisplay.tsx      # Guidance text, step info, arrival banner
    └── PollingControls.tsx      # Start/stop polling, request log (last 5 entries)
```

### Key Frontend Patterns

- **AbortController on every tick**: The 50ms intervals abort any in-flight request before starting the next. This prevents request queuing when the backend is slow.
- **Stale closure prevention**: `getRequest()` callback is stored in a `useRef` and updated each render so the polling `setInterval` always reads the current simulated sensor state.
- **Walk simulation**: Moves the simulated GPS position toward the destination at 1.4 m/s using Haversine bearing + dead-reckoning. Bearing is auto-computed and fed into IMU `headingDegrees`.
- **IMU auto-values**: `accelZ = 9.81`, other fields default to 0 so testers don't need to fill all 12 IMU fields.

### Testing Scenarios

| Scenario | How to trigger |
|---|---|
| Kalman filter (GPS vs IMU) | Set HDOP > 4 → IMU dead reckoning dominates |
| Map-matching | Set HDOP > 3 → OSRM snaps position to nearest road |
| Off-route recovery | Edit lat/lon to a position > 30m from route |
| Redis cache hit | Same route, second run → `CACHED` badge appears |

---

## Architecture

### Request Pipeline

Every 50ms the client calls `POST /api/v1/navigation/update`. The flow is entirely reactive (`Mono<T>`) through `NavigationOrchestrator`:

```
NavigationRequest
  → KalmanGpsFilterService     (GPS + IMU fusion)
  → OsrmClient.snapToRoad()    (only when HDOP > 3.0)
  → RouteService.getCurrentStep()
  → ContextBuilderService      (Mono.zip: POI + elevation in parallel)
  → GuidanceGenerationService  (Redis cache → Claude API)
  → NavigationResponse
```

### Session Lifecycle

Sessions are stateful. **`POST /start` must be called before `/update`** — both `KalmanGpsFilterService` and `RouteService` store per-session state in `ConcurrentHashMap`. Call `DELETE /{sessionId}` (or arrive) to release memory.

### GPS Correction Strategy (KalmanGpsFilterService)

State vector: `[lat, lon, v_lat, v_lon]`. Measurement noise is HDOP-adaptive:
- HDOP < 2: standard GPS trust
- HDOP > 4: ~1/500x GPS trust → IMU dead reckoning dominates (alley/building mode)

Barometer altitude always takes priority over GPS altitude. Map-matching via OSRM `/nearest` is applied on top when GPS quality is poor.

### LLM Guidance Rules (GuidanceGenerationService)

The system prompt hard-forbids mentioning distances (m/km). All guidance uses POI landmarks and terrain descriptions. Cache key is `{direction}_{terrain}_{topPoi}` — semantic, not GPS-based — so the same cache entry is reused across sessions walking the same route. Last-step guidance is never cached.

### Off-Route Recovery (RouteService)

- Step completion: < 10m to step endpoint
- Off-route trigger: > 30m from route line segment → OSRM recalculates from current position
- Arrival: < 15m to final destination → session cleared
