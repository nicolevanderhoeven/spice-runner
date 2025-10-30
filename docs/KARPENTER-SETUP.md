# Karpenter setup guide for GKE

This guide explains how to set up Karpenter on Google Kubernetes Engine (GKE).

{{< admonition type="warning" >}}
Karpenter's support for GKE is currently in preview/experimental state and is not recommended for production use. This guide is for demo and testing purposes only.
{{< /admonition >}}

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Integration with KEDA](#integration-with-keda)
8. [Troubleshooting](#troubleshooting)
9. [Cost Optimization](#cost-optimization)

## Overview

Karpenter is an open-source Kubernetes cluster autoscaler that provisions compute resources based on pending pod requirements. Unlike traditional cluster autoscalers that work with predefined node groups, Karpenter dynamically provisions nodes with the optimal size and configuration.

### Why Karpenter for this demo

Karpenter provides the following benefits for demonstrations:

- **Fast provisioning**: Nodes are ready in 30-60 seconds vs 2-5 minutes with traditional autoscalers
- **Cost optimization**: Automatically selects the most cost-effective instance types
- **Flexibility**: Supports diverse workload requirements without pre-configured node pools
- **Perfect for demos**: Showcases cutting-edge autoscaling technology

### Karpenter + KEDA = Complete autoscaling

```
User Traffic → Metrics (Prometheus)
                 ↓
              KEDA (scales pods based on metrics)
                 ↓
           More pods needed → Pending pods
                 ↓
           Karpenter (provisions nodes for pending pods)
                 ↓
           New nodes created → Pods scheduled
```

## Prerequisites

Before you begin, ensure you have the required tools and permissions.

### Required tools

To verify you have the required tools installed, run the following commands:

```bash
# kubectl
kubectl version --client

# gcloud CLI
gcloud version

# Helm 3.x
helm version

# k6 (for load testing)
k6 version
```

### Required permissions

Your GCP account needs the following IAM roles:

- `roles/container.admin`: Manage GKE clusters
- `roles/compute.admin`: Create/delete compute instances
- `roles/iam.serviceAccountAdmin`: Create service accounts
- `roles/iam.serviceAccountUser`: Use service accounts

### GKE cluster requirements

Your GKE cluster must meet the following requirements:

- **Workload Identity enabled**: Required for Karpenter to authenticate with GCP
- **VPC-native cluster**: Uses alias IP ranges
- **Sufficient quota**: Check GCP quotas for CPU, memory, and instances

To check if Workload Identity is enabled, run the following command:

```bash
gcloud container clusters describe <cluster-name> \
  --region <region> \
  --format="value(workloadIdentityConfig.workloadPool)"
```

If empty, enable Workload Identity by running the following command:

```bash
gcloud container clusters update <cluster-name> \
  --region <region> \
  --workload-pool=<project-id>.svc.id.goog
```

## Architecture

### Components

1. **Karpenter Controller**: Watches for pending pods and provisions nodes
2. **NodePools**: Define requirements and constraints for node provisioning
3. **NodeClasses**: GCP-specific configuration (machine types, disks, networking)
4. **NodeClaims**: Represent nodes that Karpenter is managing

### Node provisioning flow

The node provisioning process follows these steps:

1. Pod is created by KEDA
2. Pod cannot be scheduled (no capacity)
3. Karpenter sees pending pod
4. Karpenter evaluates NodePool requirements
5. Karpenter creates a NodeClaim
6. GCP provisions the instance
7. Node joins cluster
8. Pod is scheduled on new node

### Node deprovisioning flow

The node deprovisioning process follows these steps:

1. Node becomes underutilized (< 50% CPU/memory)
2. Karpenter waits for consolidation delay (30 seconds by default)
3. Karpenter cordons and drains the node
4. Pods are rescheduled on other nodes
5. Node is terminated
6. GCP deletes the instance

## Installation

### Step 1: Set Environment Variables

```bash
export GCP_PROJECT_ID=$(gcloud config get-value project)
export CLUSTER_NAME="spice-runner-cluster"  # Your cluster name
export KARPENTER_VERSION="0.37.0"          # Latest stable version

# For regional clusters (multi-zone):
export REGION="us-central1"

# OR for zonal clusters (single zone):
export ZONE="us-central1-a"

# To check your cluster location:
gcloud container clusters list --project=$GCP_PROJECT_ID
# Look at the LOCATION column - if it ends with a letter (e.g., us-central1-a), it's a zone
```

### Step 2: Run Installation Script

```bash
chmod +x scripts/install-karpenter-gke.sh
./scripts/install-karpenter-gke.sh
```

This script will:
1. Enable required GCP APIs
2. Create a Google Service Account for Karpenter
3. Grant necessary IAM roles
4. Configure Workload Identity
5. Install Karpenter via Helm
6. Wait for Karpenter to be ready

### Step 3: Apply NodeClass Configuration

Update the NodeClass with your project ID:

```bash
export GCP_PROJECT_ID=$(gcloud config get-value project)
envsubst < k8s/karpenter-nodeclass.yaml | kubectl apply -f -
```

Or manually edit `k8s/karpenter-nodeclass.yaml` and replace `${GCP_PROJECT_ID}` with your actual project ID.

### Step 4: Apply NodePool Configuration

```bash
kubectl apply -f k8s/karpenter-nodepool.yaml
```

### Step 5: Verify Installation

```bash
# Check Karpenter is running
kubectl get pods -n karpenter

# Check NodePools are created
kubectl get nodepools

# Check NodeClasses
kubectl get nodeclasses

# View Karpenter logs
kubectl logs -f -n karpenter -l app.kubernetes.io/name=karpenter
```

## Configuration

### NodePools

We've configured three NodePools for different scenarios:

#### 1. Default NodePool (`default`)
- **Purpose**: General-purpose workloads
- **Instance types**: e2-standard-2, e2-standard-4, n2-standard-2
- **Capacity type**: On-demand and spot
- **Limits**: 100 CPUs, 400 GB memory
- **Use case**: Standard spice-runner pods

#### 2. Cost-Optimized NodePool (`cost-optimized`)
- **Purpose**: Maximum cost savings
- **Instance types**: e2-small, e2-medium, e2-standard-2
- **Capacity type**: Spot only
- **Limits**: 50 CPUs, 200 GB memory
- **Use case**: Development, testing, non-critical workloads
- **Note**: Requires toleration for `workload-type=spot-tolerant`

#### 3. High-Performance NodePool (`high-performance`)
- **Purpose**: Burst traffic scenarios
- **Instance types**: c2-standard-4, c2-standard-8, n2-standard-4
- **Capacity type**: On-demand only
- **Limits**: 64 CPUs, 256 GB memory
- **Use case**: Traffic spikes, peak hours

### Targeting Specific NodePools

To schedule pods on a specific NodePool, use node selectors:

#### Default Pool (no changes needed)
Pods will use the default pool automatically.

#### Cost-Optimized Pool
```yaml
spec:
  nodeSelector:
    workload-type: cost-optimized
  tolerations:
  - key: workload-type
    value: spot-tolerant
    effect: NoSchedule
```

#### High-Performance Pool
```yaml
spec:
  nodeSelector:
    workload-type: high-performance
```

### Customizing NodePools

Edit `k8s/karpenter-nodepool.yaml` to adjust:

- **Instance types**: Change the `node.kubernetes.io/instance-type` values
- **Zones**: Modify `topology.kubernetes.io/zone` values
- **Limits**: Adjust `limits.cpu` and `limits.memory`
- **Disruption policy**: Change `disruption.consolidationPolicy`
- **Expiration**: Set `disruption.expireAfter` for node rotation

## Testing

### Interactive Testing

Run the interactive test script:

```bash
chmod +x scripts/run-karpenter-test.sh
./scripts/run-karpenter-test.sh
```

This provides a menu with:
1. View cluster state
2. Watch Karpenter logs
3. Light load test (5 VUs, 2 min)
4. Medium load test (20 VUs, 3 min)
5. Heavy load test (50 VUs, 5 min)
6. Spike test (0→100→0 VUs)
7. Node consolidation test
8. Run all tests sequentially

### Manual Testing

#### Test 1: Node Provisioning

```bash
# Scale deployment to trigger node creation
kubectl scale deployment spice-runner --replicas=20

# Watch nodes being created
kubectl get nodes -w

# Watch NodeClaims
kubectl get nodeclaims -w

# View Karpenter decisions
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=100
```

#### Test 2: Node Consolidation

```bash
# Scale down to trigger node removal
kubectl scale deployment spice-runner --replicas=1

# Watch nodes being removed (after ~30s delay)
kubectl get nodes -w

# Check Karpenter logs for consolidation decisions
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=100 | grep -i consolidat
```

#### Test 3: Load Testing with k6

```bash
# Set your app URL
export TARGET_URL="http://your-app-url.com/spice/"

# Run spike test
node scripts/hpa-spike-test.js

# Watch the entire autoscaling chain:
# 1. Traffic increases
# 2. KEDA scales pods
# 3. Pods go pending
# 4. Karpenter provisions nodes
# 5. Pods are scheduled
```

### Monitoring Karpenter

```bash
# View all Karpenter resources
kubectl get nodepools,nodeclasses,nodeclaims

# Describe a NodePool
kubectl describe nodepool default

# View Karpenter metrics
kubectl port-forward -n karpenter svc/karpenter 8080:8080
# Visit http://localhost:8080/metrics

# Watch events
kubectl get events -w | grep -i karpenter
```

## Integration with KEDA

Karpenter works seamlessly with KEDA. Here's how they interact:

### Current KEDA Configuration

Your KEDA `ScaledObject` (from `k8s/keda-scaledobject.yaml`):
- **Min replicas**: 1
- **Max replicas**: 10
- **Triggers**: HTTP request rate, CPU utilization, memory utilization

### How They Work Together

1. **Low traffic**: KEDA maintains 1 pod, Karpenter consolidates nodes
2. **Increasing traffic**: KEDA scales to 5 pods, existing nodes accommodate
3. **High traffic**: KEDA scales to 10 pods, some pods pending
4. **Karpenter triggered**: Provisions new node(s) for pending pods
5. **Traffic decreases**: KEDA scales down pods, Karpenter consolidates nodes

### Optimizing the Integration

To get the most out of Karpenter + KEDA:

#### 1. Increase KEDA maxReplicaCount
Since Karpenter can provision nodes dynamically, you're no longer limited by pre-existing nodes:

```yaml
# k8s/keda-scaledobject.yaml
spec:
  maxReplicaCount: 50  # Increased from 10
```

#### 2. Adjust Resource Requests
Ensure pods have realistic resource requests so Karpenter can right-size nodes:

```yaml
# k8s/deployment-cloud-stack.yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "30m"  # Currently good
  limits:
    memory: "128Mi"
    cpu: "200m"
```

#### 3. Use Pod Disruption Budgets
Protect your workload during node consolidation:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: spice-runner-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: spice-runner
```

## Troubleshooting

### Karpenter Not Provisioning Nodes

**Symptoms**: Pods remain pending, no new nodes created

**Checks**:
```bash
# Check Karpenter logs for errors
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=100

# Check if NodePools exist
kubectl get nodepools

# Verify pod requirements match NodePool constraints
kubectl describe pod <pending-pod-name>

# Check GCP quotas
gcloud compute project-info describe --project=$GCP_PROJECT_ID
```

**Common causes**:
- GCP quota exceeded
- NodePool requirements too restrictive
- IAM permissions missing
- Network/firewall issues

### Nodes Not Joining Cluster

**Symptoms**: NodeClaims created, but nodes not appearing in `kubectl get nodes`

**Checks**:
```bash
# Check NodeClaims status
kubectl get nodeclaims -o yaml

# Check GCP console for instances
gcloud compute instances list --filter="labels.karpenter_sh_initialized=*"

# Check node logs (SSH to instance)
gcloud compute ssh <instance-name> --zone=<zone>
sudo journalctl -u kubelet
```

**Common causes**:
- Network configuration mismatch
- Service account permissions
- Workload Identity misconfiguration

### Nodes Not Consolidating

**Symptoms**: Underutilized nodes remain in cluster

**Checks**:
```bash
# Check NodePool disruption settings
kubectl get nodepool default -o jsonpath='{.spec.disruption}'

# Check if nodes have do-not-evict annotation
kubectl get nodes -o custom-columns=NAME:.metadata.name,ANNOTATIONS:.metadata.annotations

# Check Karpenter logs for consolidation decisions
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter | grep -i consolidat
```

**Common causes**:
- `consolidationPolicy: WhenEmpty` instead of `WhenUnderutilized`
- Pod Disruption Budgets blocking eviction
- Nodes have local storage or system pods

### High Costs

**Symptoms**: GCP bill higher than expected

**Checks**:
```bash
# Check instance types being used
kubectl get nodes -o custom-columns=NAME:.metadata.name,INSTANCE-TYPE:.metadata.labels.node\\.kubernetes\\.io/instance-type,ZONE:.metadata.labels.topology\\.kubernetes\\.io/zone

# Check NodePool limits
kubectl get nodepools -o yaml | grep -A 2 limits

# View current resource usage
kubectl top nodes
```

**Solutions**:
- Lower NodePool limits
- Use cost-optimized NodePool with spot instances
- Set more aggressive consolidation policies
- Use smaller instance types

## Cost Optimization

### Use Spot Instances

Spot instances can save up to 80% on compute costs:

```yaml
# In NodePool requirements
- key: karpenter.sh/capacity-type
  operator: In
  values:
  - spot  # Use spot instances
```

**Trade-offs**:
- Can be terminated with 30-second notice
- Good for stateless workloads like spice-runner
- Use on-demand for critical workloads

### Set Appropriate Limits

Prevent runaway costs with NodePool limits:

```yaml
# k8s/karpenter-nodepool.yaml
limits:
  cpu: "50"      # Max 50 CPUs across all nodes
  memory: 200Gi  # Max 200 GB memory
```

### Enable Consolidation

Ensure nodes are removed when underutilized:

```yaml
disruption:
  consolidationPolicy: WhenUnderutilized  # Remove underutilized nodes
  consolidateAfter: 30s                   # Wait 30s before consolidating
```

### Use Smaller Instance Types

Allow Karpenter to choose smaller instances:

```yaml
requirements:
- key: node.kubernetes.io/instance-type
  operator: In
  values:
  - e2-small     # 0.5 vCPU, 2 GB RAM
  - e2-medium    # 1 vCPU, 4 GB RAM
  - e2-standard-2  # 2 vCPU, 8 GB RAM
```

### Set Node Expiration

Regularly rotate nodes to prevent long-running instances:

```yaml
disruption:
  expireAfter: 168h  # 7 days - nodes are replaced weekly
```

### Monitor Costs

```bash
# View current node count and types
kubectl get nodes -o custom-columns=NAME:.metadata.name,INSTANCE-TYPE:.metadata.labels.node\\.kubernetes\\.io/instance-type,CAPACITY-TYPE:.metadata.labels.karpenter\\.sh/capacity-type

# Set up billing alerts in GCP Console
# Navigation: Billing → Budgets & alerts
```

## Next Steps

1. **Run load tests**: Use the testing script to see Karpenter in action
2. **Monitor costs**: Set up GCP billing alerts
3. **Tune configuration**: Adjust NodePool settings based on your workload
4. **Integrate with CI/CD**: Automate Karpenter configuration updates
5. **Document learnings**: Share findings from this experimental setup

## Resources

- [Karpenter Documentation](https://karpenter.sh/)
- [Karpenter GKE Guide](https://karpenter.sh/docs/cloud-providers/gcp/)
- [KEDA Documentation](https://keda.sh/)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)

## Feedback and Issues

Since Karpenter on GKE is experimental, you may encounter issues. When you do:

1. Check Karpenter logs for error messages
2. Search [Karpenter GitHub Issues](https://github.com/aws/karpenter/issues)
3. Report bugs with detailed reproduction steps
4. Share your learnings with the community

---

**Remember**: This is an experimental feature. Monitor closely and be prepared to fall back to GKE's native Cluster Autoscaler if needed.

