# Spice Runner - Grafana Dashboards

This directory contains Grafana dashboards and a local testing stack for the Spice Runner game observability.

## Quick Start (Local Testing)

### 1. Start the local observability stack

```bash
cd grafana
docker-compose up -d
```

This starts:
- **Grafana** at http://localhost:3000 (admin/admin)
- **Prometheus** at http://localhost:9090
- **Loki** at http://localhost:3100
- **Tempo** at http://localhost:3200

### 2. Access Grafana

Open http://localhost:3000 and login with:
- Username: `admin`
- Password: `admin`

The dashboard will be automatically provisioned in the "Spice Runner" folder.

### 3. Send test data (optional)

To test with data, you can:

**Push metrics to Prometheus:**
```bash
# Prometheus accepts remote_write at http://localhost:9090/api/v1/write
```

**Push logs to Loki:**
```bash
curl -X POST http://localhost:3100/loki/api/v1/push \
  -H "Content-Type: application/json" \
  -d '{
    "streams": [{
      "stream": { "app": "faro", "event_name": "game_session_start" },
      "values": [["'$(date +%s)000000000'", "{\"event_name\":\"game_session_start\",\"sessionId\":\"test123\"}"]]
    }]
  }'
```

**Push traces to Tempo:**
```bash
# Tempo accepts OTLP at http://localhost:4318/v1/traces (HTTP) or localhost:4317 (gRPC)
```

### 4. Stop the stack

```bash
docker-compose down
# To also remove volumes:
docker-compose down -v
```

## Dashboard Overview

### Spice Runner - Overview (`spice-runner-overview.json`)

A comprehensive dashboard with 4 main sections:

| Section | Data Source | What it shows |
|---------|-------------|---------------|
| **Game Statistics** | Loki (Faro events) | Sessions, jumps, high scores, collisions, game events over time |
| **Backend Performance** | Prometheus | HTTP request rate, latency (P50/P95/P99), cache hit ratio, DB queries |
| **Infrastructure** | Prometheus | Pod counts, CPU/memory utilization, node count, KEDA scaling |
| **Logs & Traces** | Loki + Tempo | Nginx logs, error logs, distributed traces |

### Template Variables

The dashboard uses template variables for datasources, making it easy to switch between:
- Local datasources (for testing)
- Grafana Cloud datasources (for production)

## Importing to Grafana Cloud

### Method 1: Import via UI

1. Open your Grafana Cloud instance
2. Go to **Dashboards** → **Import**
3. Upload `dashboards/spice-runner-overview.json`
4. Update the datasource variables to match your Grafana Cloud datasources:
   - `prometheus_datasource` → your Grafana Cloud Prometheus/Mimir
   - `loki_datasource` → your Grafana Cloud Loki
   - `tempo_datasource` → your Grafana Cloud Tempo
5. Click **Import**

### Method 2: Import via API

```bash
# Replace with your Grafana Cloud URL and API key
GRAFANA_URL="https://your-instance.grafana.net"
GRAFANA_API_KEY="your-api-key"

curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/spice-runner-overview.json
```

### Datasource UID Mapping

When importing to Grafana Cloud, you may need to update datasource UIDs:

| Local UID | Grafana Cloud UID (typical) |
|-----------|----------------------------|
| `prometheus` | `grafanacloud-prom` |
| `loki` | `grafanacloud-logs` |
| `tempo` | `grafanacloud-traces` |

Use the datasource dropdown variables in the dashboard to select the correct datasources after import.

## Dashboard Panels Reference

### Game Statistics (Faro/Loki)
- **Game Sessions**: Total `game_session_start` events
- **Total Jumps**: Count of `player_jump` events
- **High Scores**: Count of `high_score` events
- **Games Played**: Count of `game_over` events
- **Leaderboard Submissions**: Count of `score_submitted_to_leaderboard` events
- **Collisions**: Count of `game_collision` events
- **Game Events Over Time**: Time series of all event types
- **Player Activity**: Jumps per minute

### Backend Performance (Prometheus)
- **HTTP Request Rate by Route**: Requests/second by API endpoint
- **HTTP Request Latency**: P50, P95, P99 percentiles
- **Cache Hit Ratio**: Redis cache effectiveness
- **API P95 Latency**: Gauge showing 95th percentile latency
- **Error Rate**: Percentage of 5xx responses
- **Score Submissions**: Submission rate and errors
- **DB Query Latency**: P95 latency by query type

### Infrastructure (Prometheus)
- **App Pods / API Pods / Nodes**: Current counts
- **Cluster CPU / Memory**: Utilization gauges
- **Nginx RPS**: Request rate (KEDA trigger metric)
- **Pod Scaling Over Time**: Actual vs KEDA desired replicas
- **App Pod CPU/Memory Utilization**: Per-pod resource usage
- **Cluster Node Count**: Node scaling over time
- **Nginx Request Rate**: The KEDA scaling trigger visualization

### Logs & Traces (Loki/Tempo)
- **Nginx Access Logs**: Parsed access log entries
- **Nginx Error Logs**: Error-level log entries
- **Recent API Traces**: TraceQL query for leaderboard API traces

## Customization

### Adding Panels

Edit `dashboards/spice-runner-overview.json` or use the Grafana UI:

1. Make changes in local Grafana
2. Export the dashboard (Dashboard settings → JSON Model → Copy)
3. Save to `dashboards/spice-runner-overview.json`
4. Restart docker-compose to verify provisioning works

### Modifying Queries

Most Prometheus queries use job label filters like `job=~".*leaderboard.*"`. Update these to match your actual Prometheus job names if they differ.

Loki queries assume logs are labeled with `app="faro"` for Faro events. Update if your Alloy configuration uses different labels.

## Troubleshooting

### No data in panels

1. **Check datasources**: Verify datasources are connected (Settings → Data Sources)
2. **Check time range**: Ensure the time range includes when data was collected
3. **Check queries**: Use "Explore" to test queries directly
4. **Check labels**: Verify your logs/metrics have the expected labels

### Dashboard not loading

1. Check provisioning logs: `docker-compose logs grafana`
2. Verify JSON is valid: `jq . dashboards/spice-runner-overview.json`
3. Check file permissions in the container

### Port conflicts

If ports are in use, modify `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Change Grafana port
```

## File Structure

```
grafana/
├── docker-compose.yml          # Local stack definition
├── README.md                   # This file
├── dashboards/
│   └── spice-runner-overview.json
├── provisioning/
│   ├── dashboards/
│   │   └── dashboards.yml      # Dashboard auto-provisioning
│   └── datasources/
│       └── datasources.yml     # Datasource auto-provisioning
├── prometheus/
│   └── prometheus.yml          # Prometheus config
├── loki/
│   └── loki-config.yml         # Loki config
└── tempo/
    └── tempo-config.yml        # Tempo config
```
