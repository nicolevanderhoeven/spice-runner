# Kubernetes Cluster Monitoring Dashboard Guide

This guide explains how to deploy and use the Kubernetes cluster monitoring dashboard that has been added to your observability stack.

## Overview

The Kubernetes cluster monitoring dashboard provides comprehensive visibility into your Kubernetes cluster's health and performance, including:

- **Node count and status**
- **Pod count (total, running, failed)**
- **CPU utilization** (cluster-wide and by namespace)
- **Memory utilization** (cluster-wide and by namespace)
- **Network I/O**
- **Container restarts**
- **Resource inventory** (deployments, services, etc.)

## Components Added

### 1. kube-state-metrics

`kube-state-metrics` is a service that exposes Kubernetes cluster state metrics to Prometheus. It provides metrics about:
- Nodes
- Pods
- Deployments
- Services
- Persistent volumes
- And more...

**Deployed to:** `kube-system` namespace

### 2. Prometheus Scrape Configuration

Added the following scrape jobs to Prometheus:
- `kube-state-metrics` - Scrapes cluster state metrics
- `kubernetes-nodes` - Scrapes node-level metrics
- `kubernetes-pods` - Scrapes pod-level metrics (for pods with Prometheus annotations)

### 3. Kubernetes Cluster Dashboard

A comprehensive Grafana dashboard with 17 panels displaying various cluster metrics.

**Dashboard UID:** `kubernetes-cluster-monitoring`

## Deployment Instructions

### Deploy the Updated Observability Stack

```bash
kubectl apply -f k8s/observability-stack.yaml
```

This will:
1. Deploy kube-state-metrics to the `kube-system` namespace
2. Update Prometheus configuration to scrape Kubernetes metrics
3. Add the new Kubernetes dashboard to Grafana

### Verify kube-state-metrics Deployment

```bash
# Check if kube-state-metrics is running
kubectl get pods -n kube-system -l app=kube-state-metrics

# Check the service
kubectl get svc -n kube-system kube-state-metrics

# Check if metrics are being exposed
kubectl port-forward -n kube-system svc/kube-state-metrics 8080:8080
# Then visit http://localhost:8080/metrics in your browser
```

### Verify Prometheus is Scraping Metrics

```bash
# Port-forward to Prometheus
kubectl port-forward -n observability svc/prometheus 9090:9090

# Visit http://localhost:9090/targets
# You should see the following targets:
# - kube-state-metrics
# - kubernetes-nodes
# - kubernetes-pods
```

## Accessing the Dashboard

1. **Get Grafana URL:**
   ```bash
   kubectl get svc -n observability grafana
   ```

2. **Access Grafana:**
   - If using LoadBalancer: Use the external IP shown
   - If using port-forward:
     ```bash
     kubectl port-forward -n observability svc/grafana 3000:3000
     ```
     Then visit http://localhost:3000

3. **Navigate to the Dashboard:**
   - Click on "Dashboards" in the left sidebar
   - Look for the "Demos" folder
   - Click on "Kubernetes Cluster Monitoring"

## Dashboard Panels Explained

### Overview Stats (Row 1)
- **Cluster Nodes**: Total number of nodes in the cluster
- **Running Pods**: Number of pods currently in Running state
- **Total Pods**: Total number of pods across all namespaces
- **Failed Pods**: Number of pods in Failed state (threshold alerts)

### Resource Usage (Row 2)
- **Cluster CPU Usage**: CPU usage per node over time (stacked)
- **Cluster Memory Usage**: Memory usage per node over time (stacked)

### Namespace Breakdown (Row 3)
- **CPU Usage by Namespace**: Shows which namespaces are consuming CPU
- **Memory Usage by Namespace**: Shows which namespaces are consuming memory

### Status Tables (Row 4)
- **Pod Status by Namespace**: Table showing pod counts by phase and namespace
- **Node Status**: Table showing node information (version, runtime, etc.)

### Resource Inventory (Row 5)
- **Deployments**: Total number of deployments
- **StatefulSets**: Total number of statefulsets
- **DaemonSets**: Total number of daemonsets
- **Services**: Total number of services

### Additional Metrics (Rows 6-7)
- **Network I/O by Pod**: Network receive/transmit rates per pod
- **Persistent Volume Claims**: Table of all PVCs
- **Container Restarts**: Tracks container restart events (helps identify unstable pods)

## Customization

### Modify Dashboard Refresh Rate

The dashboard is set to refresh every 30 seconds. To change this:
1. Open the dashboard
2. Click the time range picker at the top right
3. Select a different refresh interval

### Add More Panels

You can add additional panels by editing the dashboard in Grafana or by modifying the `kubernetes-cluster-dashboard.json` section in `k8s/observability-stack.yaml`.

Common additional metrics you might want to add:
- Disk usage: `kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes`
- API server request rate: `sum(rate(apiserver_request_total[5m])) by (verb)`
- Scheduler metrics: `scheduler_pending_pods`

### Alerting

To set up alerts based on these metrics:
1. Click on a panel
2. Select "Edit"
3. Go to the "Alert" tab
4. Configure alert conditions
5. Save the dashboard

## Troubleshooting

### Dashboard Shows No Data

1. **Check if kube-state-metrics is running:**
   ```bash
   kubectl get pods -n kube-system -l app=kube-state-metrics
   ```

2. **Check Prometheus targets:**
   ```bash
   kubectl port-forward -n observability svc/prometheus 9090:9090
   ```
   Visit http://localhost:9090/targets and verify all targets are UP

3. **Check Prometheus can reach kube-state-metrics:**
   ```bash
   kubectl exec -n observability deployment/prometheus -- wget -O- http://kube-state-metrics.kube-system.svc.cluster.local:8080/metrics
   ```

### RBAC Errors

If kube-state-metrics cannot access Kubernetes API:
```bash
# Verify ClusterRole and ClusterRoleBinding
kubectl get clusterrole kube-state-metrics
kubectl get clusterrolebinding kube-state-metrics
```

### CPU/Memory Metrics Missing

Some metrics (like `container_cpu_usage_seconds_total` and `container_memory_working_set_bytes`) come from kubelet/cAdvisor. If these are missing:

1. **Verify kubelet is exposing metrics:**
   ```bash
   kubectl get --raw /api/v1/nodes/<node-name>/proxy/metrics/cadvisor
   ```

2. **You may need to add additional Prometheus scrape configs** for kubelet metrics. This is cluster-specific and depends on your Kubernetes setup.

### Alternative: Using Node Exporter

If cAdvisor metrics are not available, you can deploy `node-exporter` as a DaemonSet to get node-level metrics.

## Metrics Reference

### Key kube-state-metrics Metrics

| Metric | Description |
|--------|-------------|
| `kube_node_info` | Node information |
| `kube_pod_info` | Pod information |
| `kube_pod_status_phase` | Pod phase (Running, Pending, Failed, etc.) |
| `kube_deployment_created` | Deployment metadata |
| `kube_service_info` | Service information |
| `kube_pod_container_status_restarts_total` | Container restart count |

### Container Metrics (from cAdvisor/kubelet)

| Metric | Description |
|--------|-------------|
| `container_cpu_usage_seconds_total` | CPU usage in seconds |
| `container_memory_working_set_bytes` | Memory currently in use |
| `container_network_receive_bytes_total` | Network bytes received |
| `container_network_transmit_bytes_total` | Network bytes transmitted |

## Production Considerations

### For Production Use:

1. **Persistent Storage**: Change `emptyDir` to persistent volumes for Prometheus, Loki, and Grafana:
   ```yaml
   volumes:
   - name: storage
     persistentVolumeClaim:
       claimName: prometheus-storage
   ```

2. **Resource Limits**: Adjust resource requests/limits based on your cluster size:
   ```yaml
   resources:
     requests:
       cpu: 200m
       memory: 256Mi
     limits:
       cpu: 1000m
       memory: 2Gi
   ```

3. **High Availability**: Increase replicas for critical components:
   ```yaml
   replicas: 3
   ```

4. **Authentication**: Remove anonymous access and configure proper authentication for Grafana.

5. **Retention**: Configure data retention policies in Prometheus:
   ```yaml
   args:
     - '--storage.tsdb.retention.time=30d'
     - '--storage.tsdb.retention.size=50GB'
   ```

6. **Monitoring Multiple Clusters**: Use Prometheus federation or Grafana's multi-cluster features.

## References

- [kube-state-metrics Documentation](https://github.com/kubernetes/kube-state-metrics)
- [Prometheus Kubernetes Service Discovery](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
- [Kubernetes Monitoring Guide](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)

## Support

For issues or questions:
1. Check Prometheus targets: `http://<prometheus-url>:9090/targets`
2. Check Grafana data source health in Settings > Data Sources
3. Review pod logs:
   ```bash
   kubectl logs -n kube-system deployment/kube-state-metrics
   kubectl logs -n observability deployment/prometheus
   kubectl logs -n observability deployment/grafana
   ```

