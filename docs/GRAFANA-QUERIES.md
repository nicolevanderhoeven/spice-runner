# Working Grafana queries for Spice Runner demo

This document provides verified working queries for demonstrating the Spice Runner observability stack.

## Verified working queries

Use these queries to explore logs and metrics in Grafana.

### Loki queries (logs)

#### 1. All NGINX logs

```logql
{job="nginx"}
```

This query shows all NGINX access and error logs.

#### 2. NGINX logs as JSON

```logql
{job="nginx"} | json
```

This query parses the JSON structure so you can see fields like `status`, `request`, and `request_time`.

#### 3. Filter by status code (errors only)

```logql
{job="nginx"} | json | status >= 400
```

This query shows only HTTP errors (4xx and 5xx).

#### 4. Filter by status code (success only)

```logql
{job="nginx"} | json | status < 400
```

This query shows only successful requests (2xx, 3xx).

#### 5. Slow requests

```logql
{job="nginx"} | json | request_time > 0.1
```

This query shows requests that took more than 100ms.

#### 6. Requests to specific path

```logql
{job="nginx"} | json | request =~ ".*spice.*"
```

This query shows requests to the `/spice` path.

#### 7. Count requests by status

```logql
sum by (status) (count_over_time({job="nginx"} | json [5m]))
```

This query aggregates request count by HTTP status code over 5 minutes.

#### 8. Request rate

```logql
rate({job="nginx"} [1m])
```

This query shows requests per second.

### Prometheus queries (metrics)

#### 1. Grafana Alloy running components

```promql
alloy_component_controller_running_components
```

This query shows how many Alloy components are active.

#### 2. Grafana Alloy config status

```promql
alloy_config_last_load_successful
```

This query returns 1 if config loaded successfully, 0 if failed.

#### 3. Grafana Alloy build info

```promql
alloy_build_info
```

This query shows Alloy version and build information.

#### 4. Prometheus scrape targets

```promql
up
```

This query shows which targets Prometheus is successfully scraping (1 = up, 0 = down).

#### 5. Loki ingestion rate

```promql
loki_distributor_lines_received_total
```

This query shows total log lines received by Loki.

## How to use in Grafana

Follow these steps to run queries in Grafana.

### In Explore view

1. Open Grafana at: http://34.60.65.9:3000
2. Log in with credentials: `admin` / `admin`
3. Click **Explore** (compass icon on left sidebar)
4. Select the data source:
   - For logs: Choose "Loki"
   - For metrics: Choose "Prometheus"
5. Paste the query from above
6. Click **Run Query** or press Shift+Enter

### In Dashboard

To view or create dashboards:

1. Go to **Dashboards** and then **Browse**.
2. Look for "Spice Runner - Observability Stack".
3. If it's not there or showing no data:
   - Click the **+** button and then **Import**.
   - Paste the dashboard JSON or use the ConfigMap.

## Demo flow with these queries

Use this flow to demonstrate the observability stack.

### Start: Show raw logs

```logql
{job="nginx"} | json
```

**Demo script**: "Here are structured JSON logs from NGINX"

### Show filtering power

```logql
{job="nginx"} | json | status >= 400
```

**Demo script**: "You can instantly filter for errors"

### Show metrics aggregation

```logql
sum by (status) (count_over_time({job="nginx"} | json [5m]))
```

**Demo script**: "And aggregate by any field - here's requests by status code"

### Switch to Prometheus

```promql
alloy_build_info
```

**Demo script**: "Alloy is also monitoring itself in Prometheus"

### Show correlation

Follow these steps to show log and metric correlation:

1. Run Prometheus query: `up`
2. Note the timestamp
3. Switch to Loki with the same time range

**Demo script**: "Now I can correlate metrics with logs at the exact same moment"

## Troubleshooting

### No data in Loki

If you don't see data in Loki, take the following actions.

**Check if logs are flowing**:

```bash
kubectl logs -l app=spice-runner -c alloy | grep loki
```

**Generate traffic**:

```bash
for i in {1..10}; do curl -s https://nvdh.dev/spice/ > /dev/null; done
```

Wait 10-30 seconds for logs to be ingested.

### No data in Prometheus

If you don't see data in Prometheus, take the following actions.

**Check Alloy is scraping**:

```bash
kubectl logs -l app=spice-runner -c alloy | grep prometheus
```

**Check targets in Prometheus**: Go to http://localhost:9090/targets (via port-forward)

## Advanced queries

Use these advanced queries for deeper analysis.

### Log pattern extraction

```logql
{job="nginx"} | json | line_format "{{.status}} {{.request}} ({{.request_time}}s)"
```

This query creates a custom format showing just status, request, and duration.

### Requests per user agent

```logql
sum by (http_user_agent) (count_over_time({job="nginx"} | json [5m]))
```

This query shows which browsers and bots are accessing the site.

### P95 request duration (LogQL metrics)

```logql
quantile_over_time(0.95, {job="nginx"} | json | unwrap request_time [5m])
```

This query shows the 95th percentile response time.

