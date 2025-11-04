# GKE Cluster Autoscaler Configuration

**Last Verified**: November 4, 2025  
**Cluster Status**: ✅ Live and Running (6/10 nodes active)

This document details the GKE cluster autoscaler settings for the Spice Runner application, verified against the live cluster configuration.

## Overview

The GKE Cluster Autoscaler automatically adjusts the number of nodes in your cluster based on pod resource requests and availability. It works seamlessly with KEDA's pod-level autoscaling to provide end-to-end scaling from 0 to 200+ concurrent game sessions.

## Current Configuration

### Cluster Details

- **Cluster Name**: `spice-runner-cluster`
- **Project**: `dev-advocacy-380120`
- **Zone**: `us-central1-a`
- **Node Pool**: `default-pool`
- **Kubernetes Version**: `1.33.5-gke.1080000`

### Autoscaling Settings

**✅ Verified from live cluster (November 4, 2025)**

```bash
gcloud container clusters update spice-runner-cluster \
  --enable-autoscaling \
  --node-pool=default-pool \
  --min-nodes=1 \
  --max-nodes=10 \
  --zone=us-central1-a
```

| Setting | Value | Description |
|---------|-------|-------------|
| **Min Nodes** | 1 | Always keep at least 1 node running |
| **Max Nodes** | 10 | Scale up to a maximum of 10 nodes |
| **Autoscaling** | ✅ Enabled | Cluster autoscaler is active |
| **Autoscaling Profile** | BALANCED | Google's balanced scaling strategy |
| **Location Policy** | BALANCED | Distribute nodes evenly across zones |

### Node Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Machine Type** | `e2-medium` | 2 vCPU, 4 GiB memory |
| **Disk Type** | `pd-balanced` | Balanced persistent disk |
| **Disk Size** | `100 GB` | Per node storage |
| **Image Type** | `COS_CONTAINERD` | Container-Optimized OS |
| **Max Pods/Node** | `110` | Maximum pods per node |
| **Initial Node Count** | `3` | Starting node count |
| **Auto Repair** | ✅ Enabled | Automatic node repair |
| **Auto Upgrade** | ✅ Enabled | Automatic version upgrades |

## How Cluster Autoscaling Triggers

### 1. Pod Resource Requests

The cluster autoscaler monitors **unschedulable pods** and adds nodes when pods cannot fit on existing nodes.

#### Per-Pod Resource Requirements

Each `spice-runner` pod requests:

**Main Container (`spice-runner`):**
- CPU: `10m`
- Memory: `64Mi`

**Sidecar Container (`nginx-exporter`):**
- CPU: `10m`
- Memory: `16Mi`

**Sidecar Container (`alloy`):**
- CPU: `50m`
- Memory: `64Mi`

**Total per pod:**
- **CPU**: `70m` (0.07 cores)
- **Memory**: `144Mi` (~0.14 GiB)

### 2. Scale-Up Conditions

Nodes are added when:
- Pods are in `Pending` state due to insufficient CPU or memory
- Current nodes cannot accommodate new pods based on resource requests
- Pod scheduling fails due to node capacity constraints

**Example**: If KEDA scales to 50 pods (50 active game sessions):
- Total CPU needed: `50 × 70m = 3,500m = 3.5 cores`
- Total memory needed: `50 × 144Mi = 7,200Mi ≈ 7 GiB`

### 3. Scale-Down Conditions

Nodes are removed when:
- Node utilization is below the threshold (default: 50%)
- All pods on a node can be rescheduled elsewhere
- Node has been underutilized for the grace period (default: 10 minutes)
- At least `min-nodes` (1) remain in the cluster

### 4. Autoscaling Profile: BALANCED

GKE uses the **BALANCED** autoscaling profile, which provides:

- **Moderate scale-up speed**: Balances responsiveness with cost efficiency
- **Standard scale-down delay**: Default 10-minute grace period before removing nodes
- **Resource optimization**: Considers both utilization and availability

**Alternative profiles available:**
- `OPTIMIZE_UTILIZATION`: More aggressive scale-down for cost savings
- `REDUCE_COSTS`: Fastest scale-down, maximizes cost efficiency

To change the profile:
```bash
gcloud container clusters update spice-runner-cluster \
  --autoscaling-profile=optimize-utilization \
  --zone=us-central1-a
```

### 5. Scale Limits

#### Maximum Capacity (10 nodes)

With verified machine type `e2-medium` (2 vCPU, 4 GiB memory per node):
- **Total CPU**: `~20 cores` (accounting for system overhead)
- **Total Memory**: `~40 GiB` (accounting for system overhead)
- **Maximum pods**: Up to `1,100 pods` (110 max per node × 10 nodes)
- **Practical pod limit**: `~200-300 pods` (limited by CPU/memory resources)

This aligns perfectly with KEDA's `maxReplicaCount: 200` configuration.

#### Minimum Capacity (1 node)
- Ensures cluster is always available
- Supports at least 10-15 concurrent game sessions even at minimum scale
- Single `e2-medium` node provides: 2 vCPU, 4 GiB memory

#### Current Capacity (6 nodes)
- **CPU Available**: ~12 cores
- **Memory Available**: ~24 GiB
- **Pod Capacity**: Up to 660 pods (110 per node)
- **Practical Capacity**: ~80-120 spice-runner pods

## Integration with KEDA

The cluster autoscaler works in tandem with KEDA's pod autoscaling:

```
User Traffic → Nginx Metrics → Prometheus → KEDA → Scale Pods → Cluster Autoscaler → Add/Remove Nodes
```

1. **KEDA** scales pods based on HTTP request rate and CPU
2. **Cluster Autoscaler** scales nodes based on pod resource requests
3. Together, they provide seamless scaling from 0 to 200+ sessions

### Example Scaling Scenario

| Sessions | Pods (KEDA) | Nodes (GKE) | CPU Used | Memory Used |
|----------|-------------|-------------|----------|-------------|
| 0 | 0 | 1 | ~0.5 cores | ~1 GiB |
| 5 | 5 | 1 | ~0.8 cores | ~2 GiB |
| 20 | 20 | 2-3 | ~2 cores | ~4 GiB |
| 50 | 50 | 4-5 | ~4 cores | ~8 GiB |
| 100 | 100 | 7-8 | ~8 cores | ~16 GiB |
| 200 | 200 | 10 (max) | ~16 cores | ~32 GiB |

### Current Live Status

**As of last check:**
- **Active Nodes**: 6 nodes
- **Running Pods**: 3 spice-runner pods (default namespace)
- **Node Utilization**:
  - CPU: 88-157m per node (9-16% utilization)
  - Memory: 994-1445Mi per node (35-51% utilization)
- **Total Cluster Resources**:
  - CPU: ~730m used / ~12 cores available
  - Memory: ~7.8 GiB used / ~24 GiB available

## Verification Commands

### Check Current Configuration

```bash
# Describe cluster autoscaling settings
gcloud container clusters describe spice-runner-cluster \
  --zone=us-central1-a \
  --project=dev-advocacy-380120 \
  --format="yaml" | grep -A 20 "autoscaling"

# Get node pool autoscaling configuration
gcloud container node-pools describe default-pool \
  --cluster=spice-runner-cluster \
  --zone=us-central1-a \
  --project=dev-advocacy-380120 \
  --format="yaml(autoscaling,config.machineType)"
```

**Expected Output:**
```yaml
autoscaling:
  enabled: true
  locationPolicy: BALANCED
  maxNodeCount: 10
  minNodeCount: 1
config:
  machineType: e2-medium
```

### Monitor Live Autoscaling

```bash
# Watch nodes being added/removed
kubectl get nodes -w

# Check node count (current: 6 nodes)
kubectl get nodes

# View cluster autoscaler events
kubectl get events --all-namespaces --field-selector reason=TriggeredScaleUp
kubectl get events --all-namespaces --field-selector reason=ScaleDown

# Check pod scheduling status
kubectl get pods --all-namespaces -o wide | grep Pending

# Count running pods in default namespace
kubectl get pods -n default --field-selector=status.phase=Running
```

### Check Resource Usage

```bash
# View node resource requests and limits
kubectl describe nodes

# Get node resource utilization (live example below)
kubectl top nodes

# View pod resource usage
kubectl top pods -n default
```

**Live Example Output (6 nodes):**
```
NAME                                                  CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)   
gke-spice-runner-cluster-default-pool-b16b6744-7w7n   123m         13%      1445Mi          51%         
gke-spice-runner-cluster-default-pool-b16b6744-9ph5   121m         12%      1309Mi          46%         
gke-spice-runner-cluster-default-pool-b16b6744-bvf2   88m          9%       1372Mi          48%         
gke-spice-runner-cluster-default-pool-b16b6744-pkmg   131m         13%      1444Mi          51%         
gke-spice-runner-cluster-default-pool-b16b6744-rdmv   110m         11%      1247Mi          44%         
gke-spice-runner-cluster-default-pool-b16b6744-zz5t   157m         16%      994Mi           35%
```

This shows the cluster is currently underutilized and may scale down after the cooldown period.

## Modifying Autoscaling Settings

### Increase Maximum Nodes

To support more than 200 concurrent sessions:

```bash
gcloud container clusters update spice-runner-cluster \
  --enable-autoscaling \
  --node-pool=default-pool \
  --min-nodes=1 \
  --max-nodes=20 \
  --zone=us-central1-a
```

Also update KEDA configuration:

```yaml
# k8s/keda-scaledobject.yaml
spec:
  maxReplicaCount: 400  # 2 pods per node × 20 nodes
```

### Adjust Minimum Nodes

For cost savings during low-traffic periods:

```bash
# Allow scaling to 0 nodes (not recommended for production)
gcloud container clusters update spice-runner-cluster \
  --enable-autoscaling \
  --node-pool=default-pool \
  --min-nodes=0 \
  --max-nodes=10 \
  --zone=us-central1-a
```

**Note**: With `min-nodes=0`, all cluster infrastructure must be rescheduled when traffic returns, causing slower startup times.

### Disable Autoscaling

```bash
gcloud container clusters update spice-runner-cluster \
  --no-enable-autoscaling \
  --node-pool=default-pool \
  --zone=us-central1-a

# Set fixed node count
gcloud container clusters resize spice-runner-cluster \
  --num-nodes=3 \
  --node-pool=default-pool \
  --zone=us-central1-a
```

## Cost Considerations

### Current Configuration (1-10 nodes)

With verified `e2-medium` instances (on-demand):
- **Per node cost**: ~$24.27/month (~$0.0335/hour)
- **Minimum (1 node)**: ~$25/month
- **Current (6 nodes)**: ~$145/month
- **Maximum (10 nodes)**: ~$243/month
- **Storage (100GB PD-balanced per node)**: Additional ~$17/month per node

### Optimization Tips

1. **Use Preemptible Nodes**: Save up to 80% with preemptible node pools
   ```bash
   gcloud container node-pools create preemptible-pool \
     --cluster=spice-runner-cluster \
     --preemptible \
     --enable-autoscaling \
     --min-nodes=1 \
     --max-nodes=10 \
     --zone=us-central1-a
   ```

2. **Right-size node machine types**: Match node size to your pod requirements
   - Current: `70m CPU / 144Mi memory` per pod
   - Consider: `e2-small`, `e2-medium`, or `n1-standard-1`

3. **Adjust scale-down delay**: Faster scale-down reduces costs
   ```bash
   gcloud container clusters update spice-runner-cluster \
     --autoscaling-profile=optimize-utilization \
     --zone=us-central1-a
   ```

4. **Monitor idle time**: Use Grafana dashboards to identify over-provisioned periods

## Troubleshooting

### Pods Stuck in Pending

```bash
# Check why pods aren't scheduling
kubectl describe pod <pod-name>

# Look for "Insufficient cpu" or "Insufficient memory" events
kubectl get events --sort-by='.lastTimestamp'
```

**Solution**: Increase `max-nodes` or reduce pod resource requests.

### Cluster Not Scaling Up

1. Verify autoscaling is enabled:
   ```bash
   gcloud container node-pools describe default-pool \
     --cluster=spice-runner-cluster \
     --zone=us-central1-a \
     --format="yaml(autoscaling)"
   ```

2. Check cluster autoscaler logs:
   ```bash
   kubectl logs -n kube-system -l k8s-app=cluster-autoscaler
   ```

3. Verify quota limits:
   ```bash
   gcloud compute project-info describe --project=dev-advocacy-380120
   ```

### Cluster Not Scaling Down

1. Check for pods with anti-affinity rules
2. Look for pods without PodDisruptionBudgets
3. Verify node grace period has elapsed (default: 10 minutes)

```bash
# Force drain a node (use with caution)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
```

## Related Documentation

- [KEDA ScaledObject Configuration](../k8s/keda-scaledobject.yaml)
- [Pod-Per-Session Scaling](./POD-PER-SESSION-SCALING.md)
- [KEDA Testing Guide](./KEDA-TESTING.md)
- [Observability and Autoscaling](./OBSERVABILITY-AUTOSCALING.md)

## Reference

- [GKE Cluster Autoscaler Documentation](https://cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler)
- [KEDA Documentation](https://keda.sh/docs/)
- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

