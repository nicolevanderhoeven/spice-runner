# Kubernetes cluster monitoring

This project includes a comprehensive Kubernetes cluster monitoring solution built on Prometheus and Grafana.

## Quick start

Follow these steps to deploy and access the monitoring stack.

### Deploy the monitoring stack

To deploy all observability components including Kubernetes monitoring, run the following commands:

```bash
# Deploy all observability components including K8s monitoring
kubectl apply -f k8s/observability-stack.yaml

# Verify the deployment
./scripts/verify-k8s-monitoring.sh
```

### Access the dashboard

To access Grafana, run the following command:

```bash
# Port forward to Grafana
kubectl port-forward -n observability svc/grafana 3000:3000
```

Then open http://localhost:3000 and navigate to:
**Dashboards → Demos → Kubernetes Cluster Monitoring**

## What you get

### Kubernetes Cluster Monitoring dashboard

A comprehensive dashboard showing:

#### **Cluster Overview**
- Total number of nodes
- Running, total, and failed pod counts
- Real-time cluster health status

#### **Resource Utilization**
- CPU usage per node and namespace
- Memory usage per node and namespace
- Network I/O metrics per pod
- Historical trends and patterns

#### **Workload Inventory**
- Deployments, StatefulSets, DaemonSets counts
- Service counts
- Persistent Volume Claims status

#### **Health Monitoring**
- Pod status by namespace
- Container restart tracking
- Node information and status

### Components

The monitoring solution includes the following components.

#### 1. **kube-state-metrics**
- Exposes Kubernetes API object metrics
- Deployed in `kube-system` namespace
- Provides metrics about pods, nodes, deployments, services, etc.

#### 2. **Prometheus**
- Scrapes metrics from kube-state-metrics
- Scrapes node and pod metrics
- Stores time-series data
- Provides PromQL query interface

#### 3. **Grafana**
- Visualizes metrics from Prometheus
- Pre-configured dashboards
- Anonymous access enabled for demos

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                  │
│                                                      │
│  ┌──────────────────┐      ┌─────────────────────┐ │
│  │ kube-state-      │      │  kubelet/cAdvisor   │ │
│  │ metrics          │      │  (on each node)     │ │
│  │ (kube-system)    │      └─────────────────────┘ │
│  └──────────────────┘               │              │
│         │                            │              │
│         │                            │              │
│  ┌──────▼────────────────────────────▼──────────┐  │
│  │  Prometheus (observability namespace)        │  │
│  │  - Scrapes K8s metrics                       │  │
│  │  - Stores time-series data                   │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐  │
│  │  Grafana (observability namespace)           │  │
│  │  - Kubernetes Cluster Monitoring Dashboard   │  │
│  │  - Spice Runner Dashboard                    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Dashboard Panels Reference

| Panel | Metric Query | Description |
|-------|--------------|-------------|
| Cluster Nodes | `count(kube_node_info)` | Total nodes in cluster |
| Running Pods | `sum(kube_pod_status_phase{phase="Running"})` | Pods in running state |
| Total Pods | `count(kube_pod_info)` | All pods across namespaces |
| Failed Pods | `sum(kube_pod_status_phase{phase="Failed"})` | Pods in failed state |
| Cluster CPU | `sum(rate(container_cpu_usage_seconds_total[5m])) by (node)` | CPU usage per node |
| Cluster Memory | `sum(container_memory_working_set_bytes) by (node)` | Memory usage per node |
| CPU by Namespace | `sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)` | CPU per namespace |
| Memory by Namespace | `sum(container_memory_working_set_bytes) by (namespace)` | Memory per namespace |
| Deployments | `count(kube_deployment_created)` | Total deployments |
| Container Restarts | `sum(increase(kube_pod_container_status_restarts_total[1h]))` | Restart events |

## Verification

### Manual Verification Steps

1. **Check kube-state-metrics is running:**
   ```bash
   kubectl get pods -n kube-system -l app=kube-state-metrics
   ```

2. **Verify metrics are exposed:**
   ```bash
   kubectl port-forward -n kube-system svc/kube-state-metrics 8080:8080
   curl http://localhost:8080/metrics | grep kube_node_info
   ```

3. **Check Prometheus targets:**
   ```bash
   kubectl port-forward -n observability svc/prometheus 9090:9090
   # Visit http://localhost:9090/targets
   ```

4. **Verify dashboard exists:**
   ```bash
   kubectl port-forward -n observability svc/grafana 3000:3000
   # Visit http://localhost:3000 → Dashboards → Demos
   ```

### Automated Verification

Run the verification script:

```bash
./scripts/verify-k8s-monitoring.sh
```

This script checks:
- ✓ All deployments are ready
- ✓ All services exist
- ✓ RBAC configuration is correct
- ✓ Metrics are being exposed
- ✓ Prometheus can scrape targets
- ✓ Dashboards are loaded in Grafana

## Customization

### Modify Scrape Interval

Edit `k8s/observability-stack.yaml`:

```yaml
# In Prometheus ConfigMap
global:
  scrape_interval: 15s  # Change this value
  evaluation_interval: 15s
```

### Add Custom Panels

1. Edit the dashboard in Grafana UI
2. Export the JSON model
3. Update the `kubernetes-cluster-dashboard.json` section in `observability-stack.yaml`
4. Reapply: `kubectl apply -f k8s/observability-stack.yaml`

### Configure Alerts

Add alerting rules to Prometheus:

```yaml
# Add to Prometheus ConfigMap
rule_files:
  - '/etc/prometheus/alerts.yml'

# Create alerts ConfigMap
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts
  namespace: observability
data:
  alerts.yml: |
    groups:
    - name: kubernetes
      rules:
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping"
```

## Troubleshooting

### No Data in Dashboard

**Problem:** Dashboard shows "No data"

**Solutions:**

1. Check if kube-state-metrics is running:
   ```bash
   kubectl get pods -n kube-system -l app=kube-state-metrics
   ```

2. Check Prometheus targets:
   ```bash
   kubectl port-forward -n observability svc/prometheus 9090:9090
   # Visit http://localhost:9090/targets
   # All targets should be UP
   ```

3. Test metrics endpoint:
   ```bash
   kubectl exec -n observability deployment/prometheus -- \
     wget -O- http://kube-state-metrics.kube-system.svc.cluster.local:8080/metrics
   ```

### Permission Denied Errors

**Problem:** kube-state-metrics logs show permission errors

**Solutions:**

1. Verify RBAC configuration:
   ```bash
   kubectl get clusterrole kube-state-metrics
   kubectl get clusterrolebinding kube-state-metrics
   kubectl get serviceaccount -n kube-system kube-state-metrics
   ```

2. Check the binding is correct:
   ```bash
   kubectl describe clusterrolebinding kube-state-metrics
   ```

### CPU/Memory Metrics Missing

**Problem:** CPU and memory panels show no data

**Cause:** These metrics come from kubelet/cAdvisor which may require additional configuration depending on your Kubernetes distribution.

**Solutions:**

1. Check if metrics are available from kubelet:
   ```bash
   kubectl get --raw /api/v1/nodes/$(kubectl get nodes -o name | head -n1 | cut -d/ -f2)/proxy/metrics/cadvisor | grep container_cpu
   ```

2. If not available, you may need to deploy node-exporter or configure kubelet metrics.

3. For GKE specifically, ensure monitoring is enabled:
   ```bash
   gcloud container clusters update CLUSTER_NAME --enable-cloud-monitoring
   ```

### Dashboard Not Loading

**Problem:** Dashboard appears empty or doesn't load

**Solutions:**

1. Check ConfigMap is mounted:
   ```bash
   kubectl exec -n observability deployment/grafana -- ls -la /var/lib/grafana/dashboards/
   ```

2. Check Grafana logs:
   ```bash
   kubectl logs -n observability deployment/grafana
   ```

3. Verify dashboard provisioning config:
   ```bash
   kubectl exec -n observability deployment/grafana -- cat /etc/grafana/provisioning/dashboards/dashboards.yaml
   ```

## Performance Considerations

### Resource Usage

Typical resource consumption:

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| kube-state-metrics | 10-100m | 32-128Mi | None |
| Prometheus | 200-500m | 256-512Mi | 1-10GB |
| Grafana | 50-200m | 128-256Mi | 100-500MB |

### Scaling

For large clusters (>100 nodes, >1000 pods):

1. **Increase kube-state-metrics resources:**
   ```yaml
   resources:
     limits:
       cpu: 500m
       memory: 512Mi
   ```

2. **Increase Prometheus retention and resources:**
   ```yaml
   args:
     - '--storage.tsdb.retention.time=15d'
     - '--storage.tsdb.retention.size=50GB'
   resources:
     limits:
       cpu: 2000m
       memory: 4Gi
   ```

3. **Use persistent storage:**
   Replace `emptyDir` with PersistentVolumeClaims

4. **Consider Prometheus sharding** for very large deployments

## Production Checklist

Before using in production:

- [ ] Configure persistent storage for Prometheus, Loki, and Grafana
- [ ] Set up proper authentication (remove anonymous access)
- [ ] Configure TLS/SSL for Grafana
- [ ] Set resource requests and limits appropriately
- [ ] Configure data retention policies
- [ ] Set up alerting (Alertmanager)
- [ ] Enable backups for dashboards and config
- [ ] Configure high availability (multiple replicas)
- [ ] Set up monitoring for the monitoring stack itself
- [ ] Document runbooks for common issues

## Additional Resources

- [Complete Setup Guide](KUBERNETES-DASHBOARD-GUIDE.md)
- [kube-state-metrics GitHub](https://github.com/kubernetes/kube-state-metrics)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)

## Metrics Available

### From kube-state-metrics

- `kube_node_*` - Node metrics (status, capacity, etc.)
- `kube_pod_*` - Pod metrics (status, phase, resource requests/limits)
- `kube_deployment_*` - Deployment metrics
- `kube_statefulset_*` - StatefulSet metrics
- `kube_daemonset_*` - DaemonSet metrics
- `kube_service_*` - Service metrics
- `kube_persistentvolume_*` - PV/PVC metrics
- `kube_namespace_*` - Namespace metrics

### From kubelet/cAdvisor

- `container_cpu_usage_seconds_total` - Container CPU usage
- `container_memory_working_set_bytes` - Container memory usage
- `container_network_receive_bytes_total` - Network RX
- `container_network_transmit_bytes_total` - Network TX

For a complete list, query:
```bash
curl http://kube-state-metrics.kube-system:8080/metrics
```

