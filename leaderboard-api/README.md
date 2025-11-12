# Spice Runner Leaderboard API

A Go-based RESTful API with full OpenTelemetry instrumentation for the Spice Runner game leaderboard.

## Features

- ✅ RESTful API for score submission and leaderboard queries
- ✅ PostgreSQL database with connection pooling
- ✅ Redis caching layer
- ✅ Full OpenTelemetry instrumentation (traces + metrics)
- ✅ Distributed tracing with Grafana Tempo
- ✅ Prometheus metrics export
- ✅ Basic anti-cheat validation
- ✅ Health checks
- ✅ Kubernetes-ready with HPA support

## Quick Start

### Prerequisites

- Go 1.21+
- PostgreSQL 16+
- Redis 7+
- (Optional) Tempo for distributed tracing

### Local Development

1. **Start dependencies:**

```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_DB=leaderboard \
  -e POSTGRES_USER=spicerunner \
  -e POSTGRES_PASSWORD=spicerunner \
  -p 5432:5432 \
  postgres:16-alpine

# Redis
docker run -d --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

2. **Install dependencies:**

```bash
go mod download
```

3. **Run the API:**

```bash
export DATABASE_URL="postgres://spicerunner:spicerunner@localhost:5432/leaderboard?sslmode=disable"
export REDIS_URL="localhost:6379"
export PORT="8080"

go run main.go
```

4. **Test it:**

```bash
# Health check
curl http://localhost:8080/health

# Submit a score
curl -X POST http://localhost:8080/api/scores \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Test Player",
    "score": 1234,
    "sessionId": "test-123"
  }'

# Get leaderboard
curl http://localhost:8080/api/leaderboard/top?limit=10
```

## API Endpoints

### POST /api/scores
Submit a player score.

**Request:**
```json
{
  "playerName": "Paul Atreides",
  "score": 1337,
  "sessionId": "abc-123"
}
```

**Response:** 201 Created
```json
{
  "id": 42,
  "playerName": "Paul Atreides",
  "score": 1337,
  "rank": 15,
  "createdAt": "2025-11-11T12:34:56Z"
}
```

### GET /api/leaderboard/top
Get top scores.

**Query Params:**
- `limit` (default: 100, max: 1000)

**Response:** 200 OK
```json
[
  {
    "rank": 1,
    "playerName": "Paul Atreides",
    "score": 9999,
    "createdAt": "2025-11-11T12:00:00Z"
  }
]
```

### GET /api/leaderboard/player/:name
Get player statistics.

**Response:** 200 OK
```json
{
  "playerName": "Paul Atreides",
  "bestScore": 9999,
  "currentRank": 1,
  "totalGames": 42,
  "recentScores": [...]
}
```

### GET /health
Health check.

**Response:** 200 OK (healthy) or 503 Service Unavailable
```json
{
  "status": "healthy",
  "database": "up",
  "redis": "up"
}
```

## OpenTelemetry Instrumentation

### Traces

Every API request creates a distributed trace showing:
- HTTP request handling
- Score validation
- Database queries (with SQL)
- Redis operations
- Rank calculation

**Example trace:**
```
POST /api/scores (145ms)
├─ validateScore (2ms)
│  └─ checkSubmissionRate (1ms)
├─ insertScore (23ms)
│  └─ db.query: INSERT (23ms)
├─ invalidateCache (3ms)
│  └─ redis.del (3ms)
└─ calculateRank (115ms)
   └─ db.query: COUNT (110ms)
```

### Metrics

**Custom metrics:**
- `score_submissions_total` - Total submissions
- `score_submission_errors_total` - Errors by type
- `cache_hits_total` / `cache_misses_total` - Cache performance
- `score_validation_duration_seconds` - Validation time
- `db_query_duration_seconds` - Database latency by query type
- `redis_operation_duration_seconds` - Redis latency

**Auto-instrumented metrics:**
- HTTP server metrics (request duration, active requests)
- Process metrics (CPU, memory)
- Runtime metrics (goroutines, GC)

### Span Attributes

Traces include rich attributes for filtering:
```json
{
  "player.name": "Paul Atreides",
  "game.score": 1337,
  "game.session_id": "abc-123",
  "db.operation": "INSERT",
  "cache.hit": false,
  "validation.passed": true,
  "rank.calculated": 42
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://...` | PostgreSQL connection string |
| `REDIS_URL` | `localhost:6379` | Redis address |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `tempo...:4317` | Tempo OTLP endpoint |
| `PORT` | `8080` | HTTP server port |

## Building

### Local Build

```bash
go build -o leaderboard-api .
./leaderboard-api
```

### Docker Build

```bash
docker build -t spice-runner-leaderboard:latest .
docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://..." \
  -e REDIS_URL="redis:6379" \
  spice-runner-leaderboard:latest
```

### Production Build (for GKE)

```bash
# Build for GCR
docker build -t gcr.io/YOUR_PROJECT_ID/spice-runner-leaderboard:latest .
docker push gcr.io/YOUR_PROJECT_ID/spice-runner-leaderboard:latest
```

## Deployment

See [LEADERBOARD-SYSTEM.md](../docs/LEADERBOARD-SYSTEM.md) for full deployment instructions.

Quick deploy to Kubernetes:
```bash
kubectl apply -f ../k8s/leaderboard-postgres.yaml
kubectl apply -f ../k8s/leaderboard-redis.yaml
kubectl apply -f ../k8s/leaderboard-api.yaml
```

## Observability

Import the Grafana dashboard from `../grafana-dashboards/leaderboard-observability.json` to see:
- Live leaderboard
- Score submission metrics
- API performance (latency, errors)
- Database query performance
- Cache hit ratio
- Distributed traces

## Architecture

```
Frontend → API → PostgreSQL (scores)
            ↓
          Redis (cache)
            ↓
   Tempo (traces) + Prometheus (metrics)
```

**Cache Strategy:**
- Cache top 100 scores (5 min TTL)
- Cache player ranks (5 min TTL)
- LRU eviction policy
- Reduces DB load by ~90%

**Anti-Cheat:**
- Max score: 100,000
- Min interval: 10 seconds between submissions per session
- Validates session ID presence

## License

Part of the Spice Runner project by Nicole van der Hoeven.

