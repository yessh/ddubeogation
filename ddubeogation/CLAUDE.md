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

# Run single test class
./gradlew test --tests "com.ddubeogation.AudioVectorServiceTest"

# Run single test method
./gradlew test --tests "com.ddubeogation.AudioVectorServiceTest.straightAhead"

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
  → AudioVectorService         (θ → pitch/pan/haptic)
  → NavigationResponse
```

A second endpoint `GET /api/v1/audio/vector` runs at 20ms for head-tracking updates — intentionally decoupled from the 50ms position loop.

### Session Lifecycle

Sessions are stateful. **`POST /start` must be called before `/update`** — both `KalmanGpsFilterService` and `RouteService` store per-session state in `ConcurrentHashMap`. Call `DELETE /{sessionId}` (or arrive) to release memory.

### GPS Correction Strategy (KalmanGpsFilterService)

State vector: `[lat, lon, v_lat, v_lon]`. Measurement noise is HDOP-adaptive:
- HDOP < 2: standard GPS trust
- HDOP > 4: ~1/500x GPS trust → IMU dead reckoning dominates (alley/building mode)

Barometer altitude always takes priority over GPS altitude. Map-matching via OSRM `/nearest` is applied on top when GPS quality is poor.

### LLM Guidance Rules (GuidanceGenerationService)

The system prompt hard-forbids mentioning distances (m/km). All guidance uses POI landmarks and terrain descriptions. Cache key is `{direction}_{terrain}_{topPoi}` — semantic, not GPS-based — so the same cache entry is reused across sessions walking the same route. High-noise or last-step guidance is never cached.

### Noise-Adaptive Audio (AudioVectorService)

Three degradation thresholds:
| Noise | Mode |
|-------|------|
| < 60dB | Full TTS voice |
| 60–74dB | Voice + louder beep |
| 75–84dB | Short-text TTS only |
| ≥ 85dB | Haptic-only (voice disabled) |

3D spatial encoding: `pitch = 300 + (|θ|/90) × 200 Hz`, `pan = sign(θ) × (|θ|/180)`. Beep pattern escalates from `none` → `single` → `double` → `triple` as θ grows.

### Off-Route Recovery (RouteService)

- Step completion: < 10m to step endpoint
- Off-route trigger: > 30m from route line segment → OSRM recalculates from current position
- Arrival: < 15m to final destination → session cleared
