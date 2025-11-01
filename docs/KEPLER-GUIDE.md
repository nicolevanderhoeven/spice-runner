# Kepler Energy Monitoring Guide

## Overview

[Kepler](https://sustainable-computing.io/) (Kubernetes Efficient Power Level Exporter) tracks energy consumption in your Kubernetes cluster at the pod, namespace, and node level.

## Architecture

### Components Deployed

1. **Kepler DaemonSet** (runs on each node)
   - Uses eBPF to collect performance metrics
   - Exports power consumption metrics to Prometheus
   - Port: 9102

2. **Kepler Model Server**
   - Provides ML models for power estimation
   - Required for GKE/cloud environments without hardware sensors
   - Port: 8100

3. **Prometheus Integration**
   - Scrapes Kepler metrics every 30 seconds
   - Job name: `kepler`

4. **Grafana Dashboard**
   - Pre-built dashboard: "Kepler Energy & Power Consumption"
   - Located in "Energy" folder

## Power Measurement Method

### On GKE (Current Setup)

**Model-Based Estimation** 🔬

Since GKE doesn't expose hardware power sensors (RAPL), Kepler uses statistical models based on:
- CPU utilization patterns
- Memory usage
- Network I/O
- Disk operations
- Historical correlation data

**Accuracy:** ~85-90% for relative comparisons, less accurate for absolute values.

### On Bare Metal (Hypothetical)

**Hardware-Based Measurement** ⚡

With RAPL (Intel/AMD) or similar interfaces, Kepler reads actual power sensors:
- Direct Joule measurements
- Real-time power draw
- High accuracy (~95-98%)

## Deployment

### Quick Deploy

```bash
cd /Users/nic/git/spice-runner
./scripts/deploy-kepler.sh
```

### Manual Deployment

```bash
# Deploy Kepler
kubectl apply -f k8s/kepler.yaml

# Update Prometheus config
kubectl apply -f k8s/observability-stack.yaml
kubectl rollout restart deployment/prometheus -n observability

# Deploy dashboard
kubectl apply -f k8s/kepler-dashboard.yaml
kubectl rollout restart deployment/grafana -n observability
```

## Key Metrics

### Power Consumption

```promql
# Total cluster power (Watts)
sum(rate(kepler_node_platform_joules_total[1m]) * 1000)

# Power by pod
sum(rate(kepler_container_joules_total[1m]) * 1000) by (pod_name)

# Power by namespace
sum(rate(kepler_container_joules_total[1m]) * 1000) by (container_namespace)

# Power by node
sum(rate(kepler_node_platform_joules_total[1m]) * 1000) by (node)
```

### Energy Consumption

```promql
# Total energy in kWh
sum(kepler_node_platform_joules_total) / 3600000

# Energy per pod (kWh)
sum(kepler_container_joules_total) by (pod_name) / 3600000
```

### Efficiency Metrics

```promql
# Requests per Watt (for spice-runner)
sum(rate(nginx_http_requests_total[1m])) / 
sum(rate(kepler_container_joules_total{container_namespace="default"}[1m]) * 1000)

# CPU efficiency (CPU cores used per Watt)
sum(rate(container_cpu_usage_seconds_total[1m])) /
sum(rate(kepler_container_joules_total[1m]) * 1000)
```

## Dashboard Features

### Panels

1. **Total Cluster Power** - Real-time power consumption in Watts
2. **Total Energy Consumed** - Cumulative energy in kWh
3. **CO2 Emissions** - Estimated carbon footprint (assumes 475g CO2/kWh)
4. **Estimated Cost** - Energy cost (assumes $0.12/kWh)
5. **Power Over Time** - Historical power trends
6. **Power by Node** - Per-node breakdown
7. **Power by Namespace** - Namespace-level consumption
8. **Spice Runner Power** - Your app's power usage
9. **Top Power Consumers** - Most energy-intensive pods
10. **CPU vs Power** - Correlation analysis
11. **Energy Efficiency Score** - Work per Watt metric
12. **Power Distribution** - Pie chart by namespace

### Cost & Emissions Calculations

**CO2 Emissions:**
```
CO2 (grams) = Energy (kWh) × 475g
```
*Based on US average grid carbon intensity*

**Energy Cost:**
```
Cost (USD) = Energy (kWh) × $0.12
```
*Based on US average electricity price*

## Use Cases

### 1. Workload Comparison

Compare power efficiency between different deployments:

```promql
# Average power per pod
avg(rate(kepler_container_joules_total[5m]) * 1000) by (container_namespace)
```

**Example:** "Namespace A uses 30% less power than Namespace B for similar workloads"

### 2. Load Test Analysis

Track power during HPA/KEDA scaling:

```bash
# Before test
kubectl get pods -n default -l app=spice-runner

# Run load test
./scripts/run-hpa-test.sh

# Observe power increase in Grafana dashboard
```

**Insight:** "Power consumption increased by 3x during scale-out from 1 to 10 pods"

### 3. Identify Power Hogs

Find inefficient workloads:

```promql
# Pods using > 10W
kepler_container_joules_total * 1000 > 10
```

### 4. Sustainability Reporting

Generate weekly/monthly energy reports:

```promql
# Total energy this month (kWh)
sum(increase(kepler_node_platform_joules_total[30d])) / 3600000

# CO2 emissions this month (kg)
(sum(increase(kepler_node_platform_joules_total[30d])) / 3600000) * 0.475
```

### 5. Cost Attribution

Allocate energy costs to teams/projects:

```promql
# Cost per namespace (last 24h)
(sum(increase(kepler_container_joules_total[24h])) by (container_namespace) / 3600000) * 0.12
```

## Monitoring Kepler

### Check Status

```bash
# Kepler pods
kubectl get pods -n kepler

# Kepler logs
kubectl logs -n kepler -l app.kubernetes.io/name=kepler -f

# Model server logs
kubectl logs -n kepler -l app.kubernetes.io/name=kepler-model-server -f
```

### Verify Metrics

```bash
# Port-forward Kepler
kubectl port-forward -n kepler svc/kepler 9102:9102

# Check metrics endpoint
curl http://localhost:9102/metrics | grep kepler_

# Key metrics to look for:
# - kepler_container_joules_total
# - kepler_node_platform_joules_total
# - kepler_container_cpu_usage_total
```

### Prometheus Scraping

```bash
# Check if Prometheus is scraping Kepler
kubectl port-forward -n observability svc/prometheus 9090:9090

# Open in browser: http://localhost:9090/targets
# Look for job "kepler" - should show all nodes as UP
```

## Troubleshooting

### No Metrics in Grafana

1. **Check Kepler pods:**
   ```bash
   kubectl get pods -n kepler
   kubectl logs -n kepler -l app.kubernetes.io/name=kepler --tail=50
   ```

2. **Verify Prometheus scrape config:**
   ```bash
   kubectl get configmap -n observability prometheus-config -o yaml | grep -A 20 "kepler"
   ```

3. **Check Prometheus targets:**
   ```bash
   kubectl port-forward -n observability svc/prometheus 9090:9090
   # Visit: http://localhost:9090/targets
   ```

### Kepler Pods Not Starting

```bash
# Check if privileged pods are allowed
kubectl describe pod -n kepler -l app.kubernetes.io/name=kepler

# Common issues:
# - SecurityContext restrictions
# - Node /sys or /proc not accessible
# - Insufficient permissions
```

### Model Server Errors

```bash
# Check model server logs
kubectl logs -n kepler -l app.kubernetes.io/name=kepler-model-server

# Restart if needed
kubectl rollout restart deployment/kepler-model-server -n kepler
```

### Metrics Show Zero or NaN

This can happen when:
- Pods just started (need ~1-2 minutes to collect data)
- No workload is running
- Model server is still downloading/initializing models

**Wait 5 minutes and check again.**

## Integration with Autoscaling

### Energy-Aware KEDA Scaling

You could create KEDA ScaledObjects based on power consumption:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: energy-aware-scaler
spec:
  scaleTargetRef:
    name: spice-runner
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus.observability:9090
      metricName: power_per_pod
      query: |
        avg(rate(kepler_container_joules_total{container_namespace="default"}[1m]) * 1000)
      threshold: "5"  # Scale if average power per pod > 5W
```

*Note: This is experimental and not recommended for production.*

## Limitations

### GKE-Specific

✗ No hardware power sensors (RAPL)  
✗ Estimated values only  
✗ Limited GPU power tracking  
✗ No per-CPU core granularity  

✓ Good for relative comparisons  
✓ Useful for trend analysis  
✓ Sufficient for efficiency optimization  

### General

- **Cold Start:** Takes 1-2 minutes to collect initial data
- **Overhead:** ~2-5% CPU per node for eBPF collection
- **Storage:** Metrics grow linearly with pod count
- **Accuracy:** ±10-15% variation in estimates

## Best Practices

### 1. Baseline Measurement

Measure idle cluster power first:

```promql
# Cluster baseline power (no workloads)
sum(rate(kepler_node_platform_joules_total[5m]) * 1000)
```

### 2. Compare Relative, Not Absolute

Use Kepler for:
- "Service A uses 20% more power than Service B"
- "Power increased 2x during this deployment"

Avoid:
- "This pod uses exactly 4.732W" (estimate may vary)

### 3. Long-Term Trends

Weekly/monthly aggregations are more reliable than instantaneous values.

### 4. Combine with Other Metrics

Cross-reference with:
- CPU/memory utilization
- Request rates
- Cost metrics

## Additional Resources

- [Kepler Documentation](https://sustainable-computing.io/)
- [Kepler GitHub](https://github.com/sustainable-computing-io/kepler)
- [eBPF Overview](https://ebpf.io/)
- [Green Software Foundation](https://greensoftware.foundation/)

## Summary

Kepler adds **energy visibility** to your observability stack, enabling:
- ✅ Power consumption tracking
- ✅ Carbon footprint estimation
- ✅ Cost attribution
- ✅ Efficiency optimization
- ✅ Sustainability reporting

While estimates may not be billing-grade accurate on GKE, they're valuable for understanding your workload's energy characteristics and making informed optimization decisions.

