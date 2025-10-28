# T-Rex Runner Observability Demo Guide

## 🎯 What You're Demoing

A **production-grade observability stack** for a Kubernetes application using:
- **Grafana Alloy** - Modern telemetry collector
- **Prometheus** - Metrics storage
- **Loki** - Log aggregation
- **Tempo** - Distributed tracing
- **Grafana** - Unified visualization

---

## 🚀 Quick Demo Flow (5 minutes)

### 1. Show the Running Application
**URL**: https://nvdh.dev/spice/

Say:
> "Here's our T-Rex Runner game deployed on GKE with SSL. But the real magic is happening behind the scenes..."

---

### 2. Show the Architecture
**Explain**:
- Game runs in Kubernetes on GKE
- Nginx serves the game + exposes metrics
- **Alloy sidecar** collects:
  - Nginx access logs (JSON structured)
  - Nginx error logs
  - Nginx metrics (stub_status)
  - Application traces (OTLP ready)
- All data flows to in-cluster Prometheus, Loki, and Tempo
- Grafana provides unified observability

**Key Point**: 
> "Alloy is Grafana's modern replacement for agents - it's configuration-as-code, supports OTLP natively, and can collect logs, metrics, and traces with a single agent."

---

### 3. Open Grafana
**URL**: http://34.60.65.9:3000

**Login**: 
- User: `admin`
- Pass: `admin` (default, should be changed in prod)

---

### 4. Demo #1: Explore Logs in Loki

Go to **Explore** → Select **Loki**

**Query 1 - Show all nginx logs**:
```logql
{job="nginx/access"}
```

Say:
> "These are structured JSON logs from Nginx. Alloy is reading the log files, parsing the JSON, and sending to Loki."

**Query 2 - Show HTTP status codes**:
```logql
{job="nginx/access"} | json | status >= 400
```

Say:
> "We can filter by any JSON field. Here are all HTTP errors."

**Query 3 - Request duration**:
```logql
{job="nginx/access"} | json | request_time > 0.1
```

Say:
> "We can find slow requests. Loki lets us query logs like a database."

---

### 5. Demo #2: Metrics in Prometheus

Go to **Explore** → Select **Prometheus**

**Metric 1 - Request rate**:
```promql
rate(nginx_http_requests_total[5m])
```

Say:
> "This shows requests per second. Prometheus scrapes Nginx's stub_status endpoint via Alloy."

**Metric 2 - Request breakdown**:
```promql
sum by (status) (rate(nginx_http_requests_total[5m]))
```

Say:
> "We can break down by status code - 200s, 404s, etc."

**Metric 3 - Alloy metrics**:
```promql
alloy_build_info
```

Say:
> "Alloy also monitors itself - we can see version info, health, and performance."

---

### 6. Demo #3: Correlate Logs and Metrics

**Show the power of unified observability**:

1. In Prometheus, run:
```promql
rate(nginx_http_requests_total[1m])
```

2. Note the timestamp of a spike (if any)

3. Switch to Loki and query:
```logql
{job="nginx/access"} | json
```

4. Use the time picker to zoom into that same timeframe

Say:
> "When we see a spike in metrics, we can instantly jump to logs from that exact time period to see what's happening. This is the power of correlated observability."

---

### 7. Demo #4: Show the Kubernetes Integration

**Query - Pod metadata in logs**:
```logql
{job="nginx/access"} | json | line_format "{{.k8s_pod_name}} - {{.request}}"
```

Say:
> "Alloy automatically adds Kubernetes metadata - pod name, namespace, labels. We know exactly which pod served which request."

---

### 8. Demo #5: Show Real-Time Tail

In Loki Explore, click the **"Live"** button

Then visit https://nvdh.dev/spice/ and refresh a few times

Say:
> "Watch the logs streaming in real-time as I use the application. This is live tail - no waiting for batches."

---

## 🎨 Advanced Demo Points

### Configuration as Code
Show the Alloy config:
```bash
kubectl get configmap alloy-cloud-config -o yaml
```

Say:
> "This is Alloy's configuration - it's declarative, versioned in Git, and easy to maintain. No more proprietary agent configs."

### Sidecar Pattern
```bash
kubectl get pods -l app=spice-runner
```

Show the pod has 2/2 containers:
> "Alloy runs as a sidecar - one per pod. It has direct access to the application's logs via a shared volume mount."

### Resource Efficiency
```bash
kubectl top pods -l app=spice-runner
```

Say:
> "Alloy is lightweight - uses minimal CPU and memory. It's designed for cloud-native scale."

---

## 💡 Key Talking Points

### Why Alloy?
1. **Unified agent** - Replaces multiple agents (Promtail, node_exporter, OTLP collectors)
2. **Modern** - Built for OpenTelemetry, Kubernetes-native
3. **Powerful** - Can transform, filter, and route telemetry
4. **Observable** - Monitors itself, easy to debug

### Why In-Cluster Observability?
1. **Lower latency** - Data doesn't leave the cluster
2. **Lower cost** - No egress charges to external SaaS
3. **Data sovereignty** - Complete control over your data
4. **Same reliability** - If your app is up, observability is up

### The Stack
- **Loki** - Like "grep for the cloud"
- **Prometheus** - Industry standard for metrics
- **Tempo** - Distributed tracing (OTLP compatible)
- **Grafana** - Single pane of glass

---

## 🎯 Closing Statement

> "This setup gives us production-grade observability with:
> - **Logs** for troubleshooting
> - **Metrics** for monitoring
> - **Traces** for performance analysis
> - **All correlated** by time and metadata
> 
> And it's all running in Kubernetes, managed as code, and ready to scale."

---

## 📊 Bonus: Create a Quick Dashboard

If you have 5 extra minutes:

1. Go to **Dashboards** → **New** → **New Dashboard**
2. Add panels for:
   - **Request Rate**: `rate(nginx_http_requests_total[5m])`
   - **Error Rate**: `sum by (status) (rate(nginx_http_requests_total{status=~"4..|5.."}[5m]))`
   - **Recent Logs**: Use Loki panel with `{job="nginx/access"}`

Save as "T-Rex Runner Overview"

---

## 🛠️ Troubleshooting During Demo

### If Grafana is slow:
- Reduce time range to "Last 15 minutes"
- Use `| line_format` to show only relevant fields

### If no data appears:
```bash
# Check Alloy is running
kubectl get pods -l app=spice-runner

# Check Alloy logs
kubectl logs -l app=spice-runner -c alloy --tail=20

# Generate some traffic
curl https://nvdh.dev/spice/
```

### Quick health check:
```bash
# Check all services
kubectl get pods -n observability
kubectl get pods -l app=spice-runner

# All should be Running with 1/1 or 2/2
```

---

## 🎬 Demo URLs Quick Reference

- **Game**: https://nvdh.dev/spice/
- **Grafana**: http://34.60.65.9:3000 (admin/admin)
- **Prometheus** (port-forward): http://localhost:9090

---

Good luck with your demo! 🚀

