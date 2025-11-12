# OpenTelemetry Demo: Why the Leaderboard System Matters

This document explains why the Spice Runner leaderboard system is an **ideal use case** for OpenTelemetry instrumentation, contrasting it with scenarios where OTel would be overkill.

## The Problem: Not Everything Needs OTel

For a simple browser-based game like the original Spice Runner:
- ❌ No backend operations to trace
- ❌ No database queries to optimize
- ❌ No distributed systems to debug
- ❌ No caching strategies to validate
- ✅ Faro RUM (Real User Monitoring) is sufficient

**OpenTelemetry would be unnecessary overhead** for a static frontend.

## The Solution: Add Backend Complexity

By introducing a **leaderboard system**, we create genuine scenarios where OpenTelemetry provides real value:

### 1. Distributed Tracing Across Services

```
Browser (Faro)
    ↓ POST /api/scores [traceparent header]
Go API (OTel)
    ↓
PostgreSQL (pgx instrumented)
    ↓
Redis (cache check)
```

**What you can observe:**
- Full request path from browser to database
- Where time is spent (validation? query? cache?)
- Correlation between frontend events and backend traces

### 2. Database Performance Optimization

The `calculateRank()` function performs a `COUNT(*)` query:

```sql
SELECT COUNT(*) + 1 FROM scores WHERE score > $1
```

**Without OTel:** "The API is slow sometimes... why?"  
**With OTel:** "The COUNT query takes 800ms when there are >10k scores. We need to pre-calculate ranks or add better indexing."

**Trace shows:**
```
Span: calculateRank (815ms)
  ├─ Span: redis.get (2ms) - Cache MISS
  └─ Span: db.query.count (810ms) - The bottleneck!
      └─ Attribute: query.rows_scanned = 10,347
```

### 3. Cache Effectiveness Validation

**The hypothesis:** Redis caching reduces database load  
**The proof:** OpenTelemetry metrics and traces

**Metrics show:**
- Cache hit ratio: 92%
- Average latency with cache hit: 5ms
- Average latency with cache miss: 120ms

**Traces show:**
- Cache HIT path: `5ms total`
  ```
  calculateRank (5ms)
    └─ redis.get (3ms) ✓ HIT
  ```

- Cache MISS path: `120ms total`
  ```
  calculateRank (120ms)
    ├─ redis.get (2ms) ✗ MISS
    └─ db.query.count (115ms)
  ```

### 4. Anti-Cheat Detection

Validation logic flags suspicious submissions:

```go
if submission.Score > maxRealisticScore {
    span.SetAttributes(attribute.Bool("validation.suspicious", true))
    return fmt.Errorf("score too high")
}
```

**Tempo query:** Find all suspicious submissions
```
{ service.name="spice-runner-leaderboard-api" && span.validation.suspicious=true }
```

**Discover patterns:**
- Are certain players repeatedly triggering anti-cheat?
- What scores are being rejected?
- Is rate limiting working?

### 5. Correlating Metrics with Traces (Exemplars)

When you see a **spike in API latency**, click the metric point to see:
- The actual trace that caused the spike
- Which database query was slow
- Whether it was a cache miss
- What player/score caused it

**This is exemplars in action** - bridging metrics and traces.

### 6. Load Testing Insights

Run k6 load tests and observe in Grafana:

**Before optimization:**
- Database queries: P95 = 450ms
- Cache hit ratio: 0%
- API pods scaling aggressively

**After adding Redis cache:**
- Database queries: P95 = 120ms (only on cache misses)
- Cache hit ratio: 90%
- Fewer pods needed (cost savings)

**Traces prove the optimization worked** by showing most requests bypass the database.

## Real-World Scenarios You Can Demonstrate

### Scenario 1: Cache Miss Storm

**Trigger:** Clear Redis cache during load test

**Observe:**
1. Dashboard: Cache hit ratio drops to 0%
2. Dashboard: Database latency spikes
3. Dashboard: API latency increases
4. Traces: All requests show `cache.hit: false` → long DB queries
5. KEDA: More pods scale up due to increased latency
6. Traces: After cache warms up, performance improves

**Value:** Proves cache is critical; informs cache warming strategies

### Scenario 2: Database Bottleneck at Scale

**Trigger:** Load test with 100 concurrent users submitting scores

**Observe:**
1. Traces: `db.query.count` spans taking >1 second
2. Metrics: `db_query_duration_seconds` histogram shifts right
3. Traces: `calculateRank` becomes the slowest span
4. Dashboard: P95 latency exceeds SLO

**Value:** Identifies exact query causing slowdown; informs optimization (pre-calculate ranks, better indexes, pagination)

### Scenario 3: Frontend-to-Backend Correlation

**Trigger:** Player completes game and score is submitted

**Observe:**
1. Faro: `game_over` event with score + sessionId
2. Faro: `score_submitted_to_leaderboard` event with trace ID
3. Tempo: Full backend trace with matching sessionId
4. Correlation: Player's frontend experience linked to backend performance

**Value:** Debug "score didn't save" issues; measure end-to-end latency

### Scenario 4: Anti-Cheat False Positive

**Trigger:** Legitimate high score gets rejected

**Observe:**
1. Metrics: `score_submission_errors_total` increases
2. Trace: Shows `validation.suspicious=true` and `score=99,500`
3. Logs: "score too high (max 100,000)"
4. Analysis: Legitimate score near limit; adjust threshold

**Value:** Data-driven anti-cheat tuning

## What You Learn from This Demo

### Technical Skills

1. **OpenTelemetry SDK usage** in Go
   - Manual span creation
   - Span attributes for context
   - Custom metrics (counters, histograms)
   - Trace context propagation

2. **Automatic instrumentation**
   - HTTP middleware (otelmux)
   - Database instrumentation (pgx)
   - Redis instrumentation

3. **Observability best practices**
   - What to trace vs. what to meter
   - How to use span attributes effectively
   - When caching helps (and how to prove it)
   - Correlating frontend and backend telemetry

### Architectural Insights

1. **When to use caching** and how to validate it's working
2. **Database query optimization** driven by trace data
3. **Cost optimization** via performance improvements (fewer pods needed)
4. **Distributed tracing** across multiple services and languages

### Grafana/Tempo Skills

1. **Dashboard design** for operational visibility
2. **TraceQL queries** for filtering and analysis
3. **Exemplars** linking metrics to traces
4. **Data source integration** (PostgreSQL, Prometheus, Tempo)

## Conclusion: Why This Matters

The leaderboard system transforms Spice Runner from a **simple demo** into a **realistic distributed system** where OpenTelemetry provides **genuine operational value**.

Without it, you'd just be adding OTel to a static site - which is like using a sledgehammer to crack a nut.

With it, you can demonstrate:
- ✅ Real performance bottlenecks
- ✅ Cache effectiveness validation
- ✅ Database optimization driven by data
- ✅ Frontend-backend correlation
- ✅ Cost reduction through observability
- ✅ Distributed tracing in a polyglot system (JavaScript + Go)

This is **not a toy example** - it's a miniature version of production challenges:
- High-cardinality data (many players, many scores)
- Performance-critical queries (leaderboard ranking)
- Caching strategies (Redis TTL, invalidation)
- Anti-cheat validation (business logic)
- Autoscaling based on load (KEDA + metrics)

**The spice (telemetry) must flow, but only where it provides value.**

