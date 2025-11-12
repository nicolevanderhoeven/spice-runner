# Spice Runner Leaderboard System

This document describes the leaderboard system for Spice Runner, which demonstrates production-grade OpenTelemetry instrumentation with distributed tracing, metrics, and full observability.

## Table of Contents

- [Architecture](#architecture)
- [OpenTelemetry Instrumentation](#opentelemetry-instrumentation)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Observability](#observability)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Architecture

The leaderboard system consists of three main components:

```
┌─────────────────┐
│   Frontend      │  Player name capture + score submission
│   (Browser)     │  JavaScript with Faro RUM
└────────┬────────┘
         │ POST /api/scores
         ▼
┌─────────────────┐
│   Go API        │  RESTful API with OpenTelemetry
│   (leaderboard) │  Full tracing + metrics
└────┬────┬───────┘
     │    │
     │    └──────────┐
     ▼               ▼
┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │
│  (scores)│  │ (cache)  │
└──────────┘  └──────────┘
```

### Component Details

#### 1. Frontend (Browser)
- **Player Name Modal**: Captures player name post-game for scores above 1000 (defaults to "Anonymous")
- **Score Submission**: Automatically submits score to API on game over
- **Trace Propagation**: Propagates trace context to backend for distributed tracing
- **localStorage**: Remembers player name for future games

#### 2. Go API Service
- **Framework**: Gorilla Mux with OpenTelemetry middleware
- **Database**: PostgreSQL with pgx driver (OTel instrumented)
- **Cache**: Redis for leaderboard caching
- **Observability**: Full OTel instrumentation with traces and metrics
- **Anti-Cheat**: Basic validation (max score limits, submission rate limiting)

#### 3. PostgreSQL Database
- **Schema**: Single `scores` table with indexes
- **Persistence**: Uses Kubernetes PersistentVolumeClaim
- **Performance**: Indexed on score (DESC) for fast leaderboard queries

#### 4. Redis Cache
- **Purpose**: Caches top 100 scores and player ranks
- **TTL**: 5 minutes
- **Policy**: LRU eviction with 256MB max memory
- **Impact**: Reduces database load by ~90% for read-heavy workloads

## OpenTelemetry Instrumentation

### What Gets Traced

Every API request creates a distributed trace showing the complete flow:

```
Span: POST /api/scores (145ms)
├─ Span: validateScore (2ms)
│  └─ Span: checkSubmissionRate (1ms)
│     └─ Span: db.query (1ms) - SELECT last submission
├─ Span: insertScore (23ms)
│  └─ Span: db.query (23ms) - INSERT INTO scores
├─ Span: invalidateCache (3ms)
│  └─ Span: redis.del (3ms) - Delete cache key
└─ Span: calculateRank (115ms)
   ├─ Span: redis.get (2ms) - Cache MISS
   └─ Span: db.query (110ms) - COUNT scores above
```

### Custom Metrics

The API exports the following custom metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `score_submissions_total` | Counter | Total score submissions |
| `score_submission_errors_total` | Counter | Failed submissions by error type |
| `cache_hits_total` | Counter | Cache hits by key |
| `cache_misses_total` | Counter | Cache misses by key |
| `score_validation_duration_seconds` | Histogram | Time spent validating scores |
| `db_query_duration_seconds` | Histogram | Database query latency by type |
| `redis_operation_duration_seconds` | Histogram | Redis operation latency |

### Automatic Metrics

OpenTelemetry also auto-instruments:

- HTTP server metrics (request duration, active requests, etc.)
- Process metrics (CPU, memory, goroutines)
- Runtime metrics (GC, heap allocations)

### Span Attributes

Each span is enriched with contextual attributes:

```json
{
  "http.method": "POST",
  "http.route": "/api/scores",
  "http.status_code": 201,
  "player.name": "Anonymous",
  "game.score": 1337,
  "game.session_id": "abc-123",
  "db.system": "postgresql",
  "db.operation": "INSERT",
  "cache.hit": false,
  "validation.passed": true,
  "validation.suspicious": false,
  "rank.calculated": 42
}
```

These attributes enable powerful filtering in Grafana Tempo:
- Find all traces for a specific player
- Find slow database queries
- Find cache misses
- Find suspicious validation attempts

## Deployment

### Prerequisites

- GKE cluster with kubectl configured
- Docker and access to GCR (Google Container Registry)
- Existing observability stack (Tempo, Prometheus, Grafana)

### Build and Push Docker Image

```bash
cd leaderboard-api

# Build the Go application
go mod download
go build -o leaderboard-api .

# Build Docker image (use --platform linux/amd64 for cross-architecture builds)
docker build --platform linux/amd64 -t gcr.io/YOUR_PROJECT_ID/spice-runner-leaderboard:latest .

# Push to GCR
docker push gcr.io/YOUR_PROJECT_ID/spice-runner-leaderboard:latest
```

### Update Kubernetes Manifests

Edit `k8s/leaderboard-api.yaml` and replace `YOUR_PROJECT_ID` with your actual GCP project ID:

```yaml
image: gcr.io/YOUR_PROJECT_ID/spice-runner-leaderboard:latest
```

### Deploy to Kubernetes

Deploy the components in order:

```bash
# 1. Deploy PostgreSQL
kubectl apply -f k8s/leaderboard-postgres.yaml

# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s

# 2. Deploy Redis
kubectl apply -f k8s/leaderboard-redis.yaml

# Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis --timeout=60s

# 3. Deploy API
kubectl apply -f k8s/leaderboard-api.yaml

# Wait for API to be ready
kubectl wait --for=condition=ready pod -l app=leaderboard-api --timeout=300s

# 4. Deploy Dashboard
kubectl apply -f k8s/leaderboard-dashboard.yaml

# 5. Update observability stack (mounts the dashboard in Grafana)
kubectl apply -f k8s/observability-stack.yaml
kubectl rollout restart deployment/grafana -n observability
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -l component=leaderboard

# Check API logs
kubectl logs -l app=leaderboard-api --tail=50

# Test API health endpoint
kubectl port-forward svc/leaderboard-api 8080:80
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "spice-runner-leaderboard-api",
  "version": "1.0.0",
  "database": "up",
  "redis": "up"
}
```

### Configure Ingress

To expose the API externally, update your existing ingress to include:

```yaml
- path: /spice/leaderboard/*
  pathType: Prefix
  backend:
    service:
      name: leaderboard-api-service
      port:
        number: 80
```

Or patch it directly:
```bash
kubectl patch ingress spice-runner-ingress --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/rules/0/http/paths/-",
    "value": {
      "path": "/spice/leaderboard/*",
      "pathType": "Prefix",
      "backend": {
        "service": {
          "name": "leaderboard-api-service",
          "port": {"number": 80}
        }
      }
    }
  }
]'
```

### Deploy Grafana Dashboard

The dashboard is automatically provisioned via ConfigMap:

```bash
# Deploy the dashboard ConfigMap
kubectl apply -f k8s/leaderboard-dashboard.yaml

# Update observability stack to mount the dashboard
kubectl apply -f k8s/observability-stack.yaml

# Restart Grafana to pick up the new dashboard
kubectl rollout restart deployment/grafana -n observability
```

The dashboard will appear in Grafana under the **"Leaderboard"** folder as **"Spice Runner - Leaderboard Observability"**.

**Data sources** are automatically configured to use:
- **postgres** - PostgreSQL data source
- **prometheus** - Prometheus data source  
- **tempo** - Tempo data source

Ensure these data source UIDs match your Grafana configuration.

## API Reference

### Submit Score

Submit a player's score to the leaderboard.

**Endpoint:** `POST /api/scores`

**Request Body:**
```json
{
  "playerName": "Paul Atreides",
  "score": 1337,
  "sessionId": "abc-123-def-456"
}
```

**Response:** `201 Created`
```json
{
  "id": 42,
  "playerName": "Paul Atreides",
  "score": 1337,
  "rank": 15,
  "createdAt": "2025-11-11T12:34:56Z"
}
```

**Validation Rules:**
- `playerName`: Optional, max 100 characters (defaults to "Anonymous")
- `score`: Required, 0 to 100,000
- `sessionId`: Required, unique identifier
- Rate limit: One submission per 10 seconds per session

### Get Top Scores

Retrieve the top scores from the leaderboard.

**Endpoint:** `GET /api/leaderboard/top?limit=100`

**Query Parameters:**
- `limit`: Number of scores to return (default: 100, max: 1000)

**Response:** `200 OK`
```json
[
  {
    "rank": 1,
    "playerName": "Paul Atreides",
    "score": 9999,
    "createdAt": "2025-11-11T12:00:00Z"
  },
  {
    "rank": 2,
    "playerName": "Chani",
    "score": 8888,
    "createdAt": "2025-11-11T11:55:00Z"
  }
]
```

### Get Player Stats

Get statistics for a specific player.

**Endpoint:** `GET /api/leaderboard/player/:name`

**Response:** `200 OK`
```json
{
  "playerName": "Paul Atreides",
  "bestScore": 9999,
  "currentRank": 1,
  "totalGames": 42,
  "recentScores": [
    {
      "playerName": "Paul Atreides",
      "score": 9999,
      "createdAt": "2025-11-11T12:00:00Z"
    }
  ]
}
```

### Health Check

Check API and dependency health.

**Endpoint:** `GET /health`

**Response:** `200 OK` (healthy) or `503 Service Unavailable` (unhealthy)
```json
{
  "status": "healthy",
  "service": "spice-runner-leaderboard-api",
  "version": "1.0.0",
  "database": "up",
  "redis": "up"
}
```

## Observability

### Grafana Dashboard

The **Spice Runner - Leaderboard Observability** dashboard shows:

#### Top Section: Leaderboard Data
- **Top 100 Scores**: Live leaderboard table from PostgreSQL
- **Score Submission Rate**: Requests per second
- **Cache Hit Ratio**: Percentage of cache hits vs misses
- **API P95 Latency**: 95th percentile response time

#### Middle Section: Performance Metrics
- **Score Trends**: Average and max scores over time
- **Database Query Latency**: P50/P95/P99 by query type
- **Redis Operation Latency**: Cache operation performance

#### Traces Section
- **Recent Traces**: Click any trace to see full distributed trace in Tempo
- **Exemplars**: Click on metric spikes to jump to related traces

#### Bottom Section: Stats
- **Total Scores**: All-time score count
- **Unique Players**: Number of distinct players
- **All-Time High Score**: Highest score ever recorded
- **Average Score**: Mean score across all games

### Interesting Scenarios to Observe

#### 1. Cache Miss Storm

When Redis cache expires or is cleared:

**What to look for:**
- Drop in cache hit ratio (from ~90% to 0%)
- Spike in database query latency
- Increase in API response time
- Multiple traces showing `cache.hit: false`

**Where to see it:**
- Dashboard: Cache Hit Ratio gauge drops
- Traces: All `calculateRank` spans show Redis miss → DB query

#### 2. Database Bottleneck

When many players submit scores simultaneously:

**What to look for:**
- High `COUNT(*)` query latency (slow rank calculation)
- API latency increases
- Most time spent in `calculateRank` span

**Where to see it:**
- Dashboard: DB Query Latency panel shows spike in `count` queries
- Traces: Long `db.query.count` spans (>500ms)

#### 3. Anti-Cheat Detection

When a suspicious score is submitted:

**What to look for:**
- Validation errors in metrics
- Span attributes: `validation.suspicious: true`
- Error logs with rejection reason

**Where to see it:**
- Dashboard: Score Submission Errors counter increases
- Traces: Filter by `validation.suspicious=true`
- Logs: "score too high" or "submission rate exceeded"

#### 4. Load Testing Impact

Run k6 load tests and observe:

**What to look for:**
- KEDA scaling up API pods
- Cache hit ratio improvement over time
- Database query latency stabilizing
- HPA metrics correlating with trace volume

**Where to see it:**
- Dashboard: API Pod CPU Usage panel
- Metrics: `kube_deployment_status_replicas`
- Traces: Volume increase in trace search

### Example Tempo Queries

Find slow requests:
```
{ service.name="spice-runner-leaderboard-api" && duration > 500ms }
```

Find database queries:
```
{ service.name="spice-runner-leaderboard-api" && span.db.operation="INSERT" }
```

Find cache misses:
```
{ service.name="spice-runner-leaderboard-api" && span.cache.hit=false }
```

Find specific player:
```
{ service.name="spice-runner-leaderboard-api" && span.player.name="Paul Atreides" }
```

## Development

### Local Development

Run PostgreSQL locally:
```bash
docker run -d \
  --name postgres \
  -e POSTGRES_DB=leaderboard \
  -e POSTGRES_USER=spicerunner \
  -e POSTGRES_PASSWORD=spicerunner \
  -p 5432:5432 \
  postgres:16-alpine
```

Run Redis locally:
```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

Run the API:
```bash
cd leaderboard-api

# Set environment variables
export DATABASE_URL="postgres://spicerunner:spicerunner@localhost:5432/leaderboard?sslmode=disable"
export REDIS_URL="localhost:6379"
export OTEL_EXPORTER_OTLP_ENDPOINT="localhost:4317"  # Or your Tempo endpoint
export PORT="8080"

# Run
go run main.go
```

Test locally:
```bash
# Submit a score
curl -X POST http://localhost:8080/api/scores \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Test Player",
    "score": 1234,
    "sessionId": "test-session-1"
  }'

# Get leaderboard
curl http://localhost:8080/api/leaderboard/top?limit=10

# Get player stats
curl http://localhost:8080/api/leaderboard/player/Test%20Player
```

### Running Tests

```bash
cd leaderboard-api

# Unit tests (when available)
go test ./...

# Load test with k6
k6 run - <<EOF
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  const payload = JSON.stringify({
    playerName: 'LoadTest',
    score: Math.floor(Math.random() * 10000),
    sessionId: \`session-\${__VU}-\${Date.now()}\`
  });

  const res = http.post('http://localhost:8080/api/scores', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
  });

  sleep(1);
}
EOF
```

## Troubleshooting

### API Won't Start

**Symptom:** API pods crash or restart continuously

**Check:**
```bash
kubectl logs -l app=leaderboard-api --tail=50
```

**Common causes:**
1. PostgreSQL not ready
   - Solution: Wait for PostgreSQL to initialize (check `kubectl logs -l app=postgres`)
2. Wrong database credentials
   - Solution: Verify ConfigMap in `leaderboard-api.yaml`
3. Can't connect to Tempo
   - Solution: Verify Tempo service exists: `kubectl get svc -n observability tempo`

### Database Connection Errors

**Symptom:** "Failed to connect to database after 10 retries"

**Check:**
```bash
# Verify PostgreSQL is running
kubectl get pods -l app=postgres

# Check PostgreSQL logs
kubectl logs -l app=postgres --tail=50

# Test connection from API pod
kubectl exec -it deployment/leaderboard-api -- /bin/sh
# Then inside pod:
# (won't work with alpine, but you get the idea)
```

**Solution:**
- Ensure PostgreSQL service is running: `kubectl get svc postgres`
- Verify database credentials in ConfigMap
- Check network policies aren't blocking traffic

### Cache Not Working

**Symptom:** Cache hit ratio is 0%

**Check:**
```bash
# Verify Redis is running
kubectl get pods -l app=redis

# Check Redis logs
kubectl logs -l app=redis --tail=50

# Test Redis connection
kubectl exec -it deployment/redis -- redis-cli ping
```

**Solution:**
- Ensure Redis service is accessible
- Check Redis max memory settings
- Verify cache TTL is reasonable (5 minutes)

### Traces Not Appearing in Tempo

**Symptom:** Dashboard shows no traces

**Check:**
1. Verify Tempo endpoint in ConfigMap
```bash
kubectl get configmap leaderboard-api-config -o yaml
```

2. Check API can reach Tempo
```bash
kubectl exec -it deployment/leaderboard-api -- /bin/sh
# Test connectivity (if netcat available):
# nc -zv tempo.observability.svc.cluster.local 4317
```

3. Check Tempo logs
```bash
kubectl logs -n observability -l app=tempo --tail=50
```

**Solution:**
- Verify Tempo service exists: `kubectl get svc -n observability tempo`
- Check OTLP gRPC port is 4317
- Ensure no network policies blocking traffic

### High Database Latency

**Symptom:** Slow API responses, high P95 latency

**Investigate:**
1. Check PostgreSQL resource usage
```bash
kubectl top pod -l app=postgres
```

2. Look at slow queries in dashboard
   - Filter traces by `duration > 500ms`
   - Check which query types are slow

**Solutions:**
- **Slow COUNT queries**: Pre-calculate ranks periodically
- **Missing indexes**: Verify indexes exist (should be auto-created)
- **Too many scores**: Consider archiving old scores
- **Resource limits**: Increase PostgreSQL memory/CPU

### Score Submission Fails

**Symptom:** 400 Bad Request on score submission

**Common validation errors:**
1. Score too high (>100,000)
2. Submission rate exceeded (< 10 seconds between submissions)
3. Invalid session ID

**Check logs:**
```bash
kubectl logs -l app=leaderboard-api --tail=50 | grep "validation"
```

**Solution:** Adjust anti-cheat limits in `main.go` if needed:
```go
const (
    maxRealisticScore = 100000
    minScoreSubmissionInterval = 10 * time.Second
)
```

---

## Summary

The leaderboard system demonstrates:

✅ **Real backend complexity** worthy of OpenTelemetry instrumentation  
✅ **Distributed tracing** across HTTP → Database → Cache  
✅ **Custom metrics** specific to business logic  
✅ **Span attributes** for powerful filtering and debugging  
✅ **Performance optimization** via caching (observable in traces)  
✅ **Database bottlenecks** that can be identified and resolved  
✅ **Integration** with existing observability stack (Tempo, Prometheus, Grafana)  

This is a **genuine use case** for OpenTelemetry, not a contrived example. The instrumentation provides real value for debugging, performance optimization, and understanding system behavior under load.

