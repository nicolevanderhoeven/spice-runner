# Working Grafana Queries for Spice Runner Demo

## 🔍 Verified Working Queries

### Loki Queries (Logs)

#### 1. All Nginx Logs
```logql
{job="nginx"}
```
Shows all nginx access and error logs.

#### 2. Nginx Logs as JSON
```logql
{job="nginx"} | json
```
Parses the JSON structure so you can see fields like `status`, `request`, `request_time`.

#### 3. Filter by Status Code (Errors Only)
```logql
{job="nginx"} | json | status >= 400
```
Shows only HTTP errors (4xx and 5xx).

#### 4. Filter by Status Code (Success Only)
```logql
{job="nginx"} | json | status < 400
```
Shows only successful requests (2xx, 3xx).

#### 5. Slow Requests
```logql
{job="nginx"} | json | request_time > 0.1
```
Shows requests that took more than 100ms.

#### 6. Requests to Specific Path
```logql
{job="nginx"} | json | request =~ ".*spice.*"
```
Shows requests to the `/spice` path.

#### 7. Count Requests by Status
```logql
sum by (status) (count_over_time({job="nginx"} | json [5m]))
```
Aggregates request count by HTTP status code over 5 minutes.

#### 8. Request Rate
```logql
rate({job="nginx"} [1m])
```
Shows requests per second.

---

### Prometheus Queries (Metrics)

#### 1. Alloy Running Components
```promql
alloy_component_controller_running_components
```
Shows how many Alloy components are active.

#### 2. Alloy Config Status
```promql
alloy_config_last_load_successful
```
Returns 1 if config loaded successfully, 0 if failed.

#### 3. Alloy Build Info
```promql
alloy_build_info
```
Shows Alloy version and build information.

#### 4. Prometheus Scrape Targets
```promql
up
```
Shows which targets Prometheus is successfully scraping (1 = up, 0 = down).

#### 5. Loki Ingestion Rate
```promql
loki_distributor_lines_received_total
```
Shows total log lines received by Loki.

---

## 📊 How to Use in Grafana

### In Explore View:

1. **Open Grafana**: http://34.60.65.9:3000
2. **Login**: admin / admin
3. **Click "Explore"** (compass icon on left sidebar)
4. **Select Data Source**:
   - For logs: Choose "Loki"
   - For metrics: Choose "Prometheus"
5. **Paste query** from above
6. **Click "Run Query"** or press Shift+Enter

### In Dashboard:

1. Go to **Dashboards** → **Browse**
2. Look for "Spice Runner - Observability Stack"
3. If it's not there or showing no data:
   - Click **"+"** → **"Import"**
   - Paste the dashboard JSON or use the ConfigMap

---

## 🎯 Demo Flow with These Queries

### Start: Show Raw Logs
```logql
{job="nginx"} | json
```
*Say: "Here are structured JSON logs from Nginx"*

### Show Filtering Power
```logql
{job="nginx"} | json | status >= 400
```
*Say: "We can instantly filter for errors"*

### Show Metrics Aggregation
```logql
sum by (status) (count_over_time({job="nginx"} | json [5m]))
```
*Say: "And aggregate by any field - here's requests by status code"*

### Switch to Prometheus
```promql
alloy_build_info
```
*Say: "Alloy is also monitoring itself in Prometheus"*

### Show Correlation
1. Run Prometheus query: `up`
2. Note the timestamp
3. Switch to Loki with the same time range
4. *Say: "Now I can correlate metrics with logs at the exact same moment"*

---

## 🐛 Troubleshooting

### No Data in Loki?

**Check if logs are flowing:**
```bash
kubectl logs -l app=spice-runner -c alloy | grep loki
```

**Generate traffic:**
```bash
for i in {1..10}; do curl -s https://nvdh.dev/spice/ > /dev/null; done
```

**Wait 10-30 seconds** for logs to be ingested.

### No Data in Prometheus?

**Check Alloy is scraping:**
```bash
kubectl logs -l app=spice-runner -c alloy | grep prometheus
```

**Check targets in Prometheus:**
Go to http://localhost:9090/targets (via port-forward)

---

## 💡 Advanced Queries

### Log Pattern Extraction
```logql
{job="nginx"} | json | line_format "{{.status}} {{.request}} ({{.request_time}}s)"
```
Custom format showing just status, request, and duration.

### Requests per User Agent
```logql
sum by (http_user_agent) (count_over_time({job="nginx"} | json [5m]))
```
Shows which browsers/bots are accessing the site.

### P95 Request Duration (LogQL Metrics)
```logql
quantile_over_time(0.95, {job="nginx"} | json | unwrap request_time [5m])
```
Shows 95th percentile response time.

---

Good luck with your demo! 🚀

