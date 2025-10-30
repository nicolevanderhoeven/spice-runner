# Spice Runner observability demo guide

This guide helps you demonstrate the production-grade observability stack for the Spice Runner application.

## What you're demoing

This demo showcases a production-grade observability stack for a Kubernetes application using:

- **Grafana Alloy** - Modern telemetry collector
- **Prometheus** - Metrics storage
- **Loki** - Log aggregation
- **Tempo** - Distributed tracing
- **Grafana** - Unified visualization

## Quick demo flow (5 minutes)

Follow this structured flow to deliver an effective 5-minute demonstration.

### 1. Show the running application

Open the application URL: https://nvdh.dev/spice/

**Demo script**:
> "Here's our Spice Runner game deployed on GKE with SSL. But the real magic is happening behind the scenes..."

### 2. Show the architecture

Explain the following architecture components:

- Game runs in Kubernetes on GKE
- NGINX serves the game and exposes metrics
- **Grafana Alloy sidecar** collects:
  - NGINX access logs (JSON structured)
  - NGINX error logs
  - NGINX metrics (stub_status)
  - Application traces (OpenTelemetry ready)
- All data flows to in-cluster Prometheus, Loki, and Tempo
- Grafana provides unified observability

**Key point**: 
> "Grafana Alloy (full name on first mention) is Grafana's modern replacement for agents. It's configuration-as-code, supports OpenTelemetry natively, and can collect logs, metrics, and traces with a single agent."

### 3. Open Grafana

Open Grafana at: http://34.60.65.9:3000

**Login credentials**: 
- User: `admin`
- Pass: `admin` (default, should be changed in production)

### 4. Demo one: Explore logs in Loki

Go to **Explore** and select **Loki**.

**Query 1 - Show all NGINX logs**:

```logql
{job="nginx/access"}
```

**Demo script**:
> "These are structured JSON logs from NGINX. Alloy is reading the log files, parsing the JSON, and sending to Loki."

**Query 2 - Show HTTP status codes**:

```logql
{job="nginx/access"} | json | status >= 400
```

**Demo script**:
> "You can filter by any JSON field. Here are all HTTP errors."

**Query 3 - Request duration**:

```logql
{job="nginx/access"} | json | request_time > 0.1
```

**Demo script**:
> "You can find slow requests. Loki lets you query logs like a database."

### 5. Demo two: Metrics in Prometheus

Go to **Explore** and select **Prometheus**.

**Metric 1 - Request rate**:

```promql
rate(nginx_http_requests_total[5m])
```

**Demo script**:
> "This shows requests per second. Prometheus scrapes NGINX's stub_status endpoint via Alloy."

**Metric 2 - Request breakdown**:

```promql
sum by (status) (rate(nginx_http_requests_total[5m]))
```

**Demo script**:
> "You can break down by status code - 200s, 404s, etc."

**Metric 3 - Alloy metrics**:

```promql
alloy_build_info
```

**Demo script**:
> "Alloy also monitors itself. You can see version info, health, and performance."

### 6. Demo three: Correlate logs and metrics

Show the power of unified observability by following these steps:

1. In Prometheus, run the following query:

```promql
rate(nginx_http_requests_total[1m])
```

2. Note the timestamp of a spike (if any).

3. Switch to Loki and run the following query:

```logql
{job="nginx/access"} | json
```

4. Use the time picker to zoom into that same timeframe.

**Demo script**:
> "When you see a spike in metrics, you can instantly jump to logs from that exact time period to see what's happening. This is the power of correlated observability."

### 7. Demo four: Show the Kubernetes integration

Run the following query to show pod metadata in logs:

```logql
{job="nginx/access"} | json | line_format "{{.k8s_pod_name}} - {{.request}}"
```

**Demo script**:
> "Alloy automatically adds Kubernetes metadata - pod name, namespace, labels. You know exactly which pod served which request."

### 8. Demo five: Show real-time tail

In Loki Explore, click the **Live** button.

Then visit https://nvdh.dev/spice/ and refresh a few times.

**Demo script**:
> "Watch the logs streaming in real-time as I use the application. This is live tail - no waiting for batches."

## Advanced demo points

Use these additional points to enhance your demonstration.

### Configuration as code

To show the Alloy configuration, run the following command:

```bash
kubectl get configmap alloy-cloud-config -o yaml
```

**Demo script**:
> "This is Alloy's configuration. It's declarative, versioned in Git, and easy to maintain. No more proprietary agent configs."

### Sidecar pattern

To show the sidecar pattern, run the following command:

```bash
kubectl get pods -l app=spice-runner
```

Show that the pod has 2/2 containers.

**Demo script**:
> "Alloy runs as a sidecar - one per pod. It has direct access to the application's logs via a shared volume mount."

### Resource efficiency

To show resource efficiency, run the following command:

```bash
kubectl top pods -l app=spice-runner
```

**Demo script**:
> "Alloy is lightweight. It uses minimal CPU and memory. It's designed for cloud-native scale."

## Key talking points

Use these key points to explain the value proposition.

### Why Grafana Alloy?

Grafana Alloy provides several advantages:

1. **Unified agent**: Replaces multiple agents (Promtail, node_exporter, OpenTelemetry Collector)
2. **Modern**: Built for OpenTelemetry, Kubernetes-native
3. **Powerful**: Can transform, filter, and route telemetry
4. **Observable**: Monitors itself, easy to debug

### Why in-cluster observability?

In-cluster observability provides several benefits:

1. **Lower latency**: Data doesn't leave the cluster
2. **Lower cost**: No egress charges to external SaaS
3. **Data sovereignty**: Complete control over your data
4. **Same reliability**: If your app is up, observability is up

### The stack

The observability stack includes:

- **Loki**: Like "grep for the cloud"
- **Prometheus**: Industry standard for metrics
- **Tempo**: Distributed tracing (OpenTelemetry compatible)
- **Grafana**: Single pane of glass

## Closing statement

Use this closing statement to summarize the demo:

> "This setup gives you production-grade observability with:
> - **Logs** for troubleshooting
> - **Metrics** for monitoring
> - **Traces** for performance analysis
> - **All correlated** by time and metadata
> 
> And it's all running in Kubernetes, managed as code, and ready to scale."

## Bonus: Create a quick dashboard

If you have 5 extra minutes, create a quick dashboard:

1. Go to **Dashboards**, then **New**, then **New Dashboard**.
2. Add panels for the following metrics:
   - **Request Rate**: `rate(nginx_http_requests_total[5m])`
   - **Error Rate**: `sum by (status) (rate(nginx_http_requests_total{status=~"4..|5.."}[5m]))`
   - **Recent Logs**: Use Loki panel with `{job="nginx/access"}`

Save the dashboard as "Spice Runner Overview".

## Troubleshooting during demo

Use these troubleshooting tips if you encounter issues during the demo.

### If Grafana is slow

Take the following actions to improve performance:

- Reduce time range to "Last 15 minutes"
- Use `| line_format` to show only relevant fields

### If no data appears

To diagnose data collection issues, run the following commands:

```bash
# Check Alloy is running
kubectl get pods -l app=spice-runner

# Check Alloy logs
kubectl logs -l app=spice-runner -c alloy --tail=20

# Generate some traffic
curl https://nvdh.dev/spice/
```

### Quick health check

To verify all services are running correctly, run the following commands:

```bash
# Check all services
kubectl get pods -n observability
kubectl get pods -l app=spice-runner

# All should be Running with 1/1 or 2/2
```

## Demo URLs quick reference

Use these URLs for quick access during your demo:

- **Game**: https://nvdh.dev/spice/
- **Grafana**: http://34.60.65.9:3000 (admin/admin)
- **Prometheus** (port-forward): http://localhost:9090

