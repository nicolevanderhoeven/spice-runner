# Observability Stack Autoscaling

## Overview

The observability stack now includes KEDA-based autoscaling and increased resource limits to handle high load during demos and testing.

## What Changed

### 1. Resource Limit Increases

All observability components now have significantly higher resource limits:

| Component | Old CPU/Memory | New CPU/Memory |
|-----------|----------------|----------------|
| **Grafana** | 200m / 256Mi | 1000m / 2Gi |
| **Prometheus** | 500m / 512Mi | 2000m / 4Gi |
| **Loki** | 1000m / 1Gi | 2000m / 4Gi |
| **Tempo** | 200m / 256Mi | 1000m / 2Gi |

### 2. KEDA Autoscaling

#### Grafana (Horizontal Scaling)
- **Min Replicas**: 1
- **Max Replicas**: 5
- **Scale Triggers**:
  - CPU > 60% utilization
  - Memory > 70% utilization
- **Cooldown**: 5 minutes (ensures stability during demos)

This solves the Grafana slowness issue during load tests by distributing query load across multiple instances.

#### Prometheus, Loki, Tempo (Monitoring Only)
- **Replicas**: Fixed at 1 (due to ReadWriteOnce PVC constraints)
- **Scale Triggers**: CPU/Memory at 200% (monitoring only, won't trigger scaling)
- **Purpose**: KEDA monitors these components for visibility, but they won't horizontally scale

## Deployment

### Apply the Updated Configurations

```bash
# Apply the updated observability stack with increased resources
kubectl apply -f k8s/observability-stack.yaml

# Apply the KEDA ScaledObjects for autoscaling
kubectl apply -f k8s/keda-scaledobject.yaml

# Verify Grafana ScaledObject is created
kubectl get scaledobject -n observability

# Expected output:
# NAME           SCALETARGETKIND      SCALETARGETNAME   MIN   MAX   TRIGGERS   AUTHENTICATION   READY   ACTIVE   FALLBACK   PAUSED    AGE
# grafana-keda   apps/v1.Deployment   grafana           1     5     cpu, memory                  True    False    Unknown    Unknown   10s
```

### Monitor Grafana Scaling

```bash
# Watch Grafana pod count
kubectl get pods -n observability -l app=grafana -w

# Check HPA status created by KEDA
kubectl get hpa -n observability

# View Grafana ScaledObject details
kubectl describe scaledobject grafana-keda -n observability

# Check Grafana resource usage
kubectl top pods -n observability -l app=grafana
```

## Testing Grafana Autoscaling

### Trigger Grafana Scaling

```bash
# Run your existing load test
cd scripts
./run-hpa-test.sh

# In another terminal, monitor Grafana scaling
watch -n 2 'kubectl get pods -n observability -l app=grafana'

# Open Grafana dashboards and refresh multiple times
# This will increase CPU/memory usage and trigger scaling
```

### Expected Behavior

1. **At Rest**: 1 Grafana pod running
2. **During Load Test**: As users view dashboards and queries run:
   - CPU/Memory usage increases
   - KEDA detects > 60% CPU or > 70% memory
   - New Grafana pods spawn (up to 5 total)
   - Load is distributed across instances
3. **After Test**: 5-minute cooldown, then scales back to 1 pod

## Benefits

### Grafana Horizontal Scaling
✅ **Solves slowness during demos** - Multiple Grafana instances handle query load
✅ **Automatic scaling** - Scales up during load tests, down during idle periods
✅ **Cost-efficient** - Only uses resources when needed
✅ **Better UX** - Faster dashboard loading and query responses

### Resource Limit Increases
✅ **Better performance** - All components have headroom for spikes
✅ **Prevents OOM kills** - Higher memory limits prevent crashes
✅ **Suitable for demos** - Can handle burst traffic without issues

## Limitations

### PVC-Constrained Components (Prometheus, Loki, Tempo)
- Cannot horizontally scale due to ReadWriteOnce persistent volumes
- Would need architectural changes for true horizontal scaling:
  - Prometheus: Thanos, Cortex, or Mimir for distributed storage
  - Loki: Distributed mode with object storage (S3, GCS)
  - Tempo: Distributed mode with object storage

For your demo purposes, the increased resource limits should be sufficient.

## Production Considerations

If you want to implement horizontal scaling for Prometheus/Loki/Tempo:

### Prometheus Options
1. **Thanos**: Add Thanos sidecar for object storage + query frontend
2. **Cortex/Mimir**: Full distributed Prometheus-compatible system
3. **VictoriaMetrics**: High-performance Prometheus alternative with clustering

### Loki Options
1. **Loki Distributed Mode**: Separate components (ingester, querier, distributor)
2. **Object Storage**: Use S3/GCS instead of PVCs
3. **Loki Simple Scalable**: Middle ground for medium scale

### Tempo Options
1. **Tempo Distributed Mode**: Separate components like Loki
2. **Object Storage**: S3/GCS backend

## Monitoring

### Key Metrics to Watch

```promql
# Grafana CPU usage
sum(rate(container_cpu_usage_seconds_total{pod=~"grafana-.*", namespace="observability"}[5m]))

# Grafana memory usage
sum(container_memory_working_set_bytes{pod=~"grafana-.*", namespace="observability"})

# Number of Grafana pods
count(kube_pod_status_phase{pod=~"grafana-.*", namespace="observability", phase="Running"})

# KEDA metric server health
up{job="keda-metrics-apiserver"}
```

## Troubleshooting

### Grafana Not Scaling

```bash
# Check ScaledObject status
kubectl describe scaledobject grafana-keda -n observability

# Check KEDA operator logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator -f

# Check metrics are available
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1" | jq .

# Check HPA created by KEDA
kubectl describe hpa -n observability
```

### Grafana Pods CrashLooping

```bash
# Check pod logs
kubectl logs -n observability -l app=grafana --tail=100

# Check resource limits
kubectl describe pod -n observability -l app=grafana

# Check PVC status
kubectl get pvc -n observability
```

### High Resource Usage

```bash
# Check top resource consumers
kubectl top pods -n observability --sort-by=cpu
kubectl top pods -n observability --sort-by=memory

# Check if limits need adjustment
kubectl describe deployment -n observability grafana
```

## Summary

Your observability stack is now ready to handle high-load demos! Grafana will automatically scale from 1 to 5 instances based on demand, and all components have increased resource limits to prevent slowdowns and crashes during load tests.

