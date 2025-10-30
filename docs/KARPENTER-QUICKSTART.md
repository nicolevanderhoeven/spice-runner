# Karpenter quick start guide

This is a condensed guide to get Karpenter running quickly. For detailed explanations, refer to the [Karpenter setup guide](KARPENTER-SETUP.md).

{{< admonition type="warning" >}}
This is an experimental feature for demo and testing purposes only.
{{< /admonition >}}

## Prerequisites

Before you begin, ensure you have the following:

- GKE cluster with Workload Identity enabled
- `kubectl`, `gcloud`, `helm` installed
- Appropriate GCP permissions

## Installation

Follow these steps to install Karpenter in approximately 5 minutes.

### 1. Set environment variables

To set up your environment, run the following commands:

```bash
export GCP_PROJECT_ID=$(gcloud config get-value project)
export CLUSTER_NAME="your-cluster-name"

# For regional clusters (multi-zone):
export REGION="us-central1"

# OR for zonal clusters (single zone):
export ZONE="us-central1-a"

# To find your cluster type:
gcloud container clusters list --project=$GCP_PROJECT_ID
```

### 2. Run installation script

To install Karpenter, run the following command:

```bash
./scripts/install-karpenter-gke.sh
```

This installs Karpenter and sets up IAM/service accounts.

### 3. Apply NodeClass

To apply the NodeClass configuration, run the following commands:

```bash
export GCP_PROJECT_ID=$(gcloud config get-value project)
envsubst < k8s/karpenter-nodeclass.yaml | kubectl apply -f -
```

### 4. Apply NodePools

To apply the NodePools configuration, run the following command:

```bash
kubectl apply -f k8s/karpenter-nodepool.yaml
```

### 5. Verify installation

To verify the installation, run the following commands:

```bash
# Check Karpenter is running
kubectl get pods -n karpenter

# Check NodePools are created
kubectl get nodepools

# Should see: default, cost-optimized, high-performance
```

## Testing

Follow these steps to test Karpenter in approximately 5 minutes.

### Run interactive test suite

To run the interactive test suite, use the following command:

```bash
./scripts/run-karpenter-test.sh
```

Select option 3 (Light load test) to trigger node provisioning.

### Watch it work

To watch Karpenter in action, open separate terminals and run the following commands:

```bash
# Terminal 1: Watch nodes
kubectl get nodes -w

# Terminal 2: Watch pods
kubectl get pods -w

# Terminal 3: Watch Karpenter logs
kubectl logs -f -n karpenter -l app.kubernetes.io/name=karpenter
```

### Manual Test

```bash
# Scale up to trigger node creation
kubectl scale deployment spice-runner --replicas=20

# Wait ~60 seconds and check nodes
kubectl get nodes

# Scale down to trigger node consolidation
kubectl scale deployment spice-runner --replicas=1

# Wait ~30 seconds and watch nodes get removed
kubectl get nodes -w
```

## Expected Behavior

### Scale Up (KEDA → Karpenter)
1. Traffic increases
2. KEDA scales pods from 1 → 10+
3. Some pods go pending (no capacity)
4. Karpenter sees pending pods
5. Karpenter provisions new node(s) in ~60s
6. Pods are scheduled on new nodes

### Scale Down (Karpenter Consolidation)
1. Traffic decreases
2. KEDA scales pods down to 1-2
3. Nodes become underutilized
4. Karpenter waits 30 seconds
5. Karpenter drains and removes excess nodes
6. Remaining pods consolidated on fewer nodes

## Common Commands

```bash
# View Karpenter resources
kubectl get nodepools
kubectl get nodeclasses
kubectl get nodeclaims

# Describe a NodePool
kubectl describe nodepool default

# View Karpenter logs
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=50

# Check current cluster state
kubectl get nodes -o custom-columns=\
NAME:.metadata.name,\
INSTANCE:.metadata.labels.node\\.kubernetes\\.io/instance-type,\
ZONE:.metadata.labels.topology\\.kubernetes\\.io/zone,\
KARPENTER:.metadata.labels.karpenter\\.sh/initialized

# View pod distribution
kubectl get pods -o wide
```

## NodePool Selection

### Default Pool (Automatic)
No changes needed. Pods use this by default.

### Cost-Optimized Pool (Spot Instances)
Add to your deployment:
```yaml
nodeSelector:
  workload-type: cost-optimized
tolerations:
- key: workload-type
  value: spot-tolerant
  effect: NoSchedule
```

### High-Performance Pool
Add to your deployment:
```yaml
nodeSelector:
  workload-type: high-performance
```

## Troubleshooting

### Pods Pending, No Nodes Created

```bash
# Check Karpenter logs for errors
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=100

# Check NodePools exist
kubectl get nodepools

# Check pod events
kubectl describe pod <pod-name>

# Check GCP quotas
gcloud compute project-info describe --project=$GCP_PROJECT_ID | grep -A 5 quota
```

### Nodes Not Consolidating

```bash
# Check if consolidation is enabled
kubectl get nodepool default -o jsonpath='{.spec.disruption.consolidationPolicy}'
# Should be: WhenUnderutilized

# Check Karpenter logs
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter | grep -i consolidat
```

## Cost Monitoring

```bash
# View current nodes and types
kubectl get nodes -o custom-columns=\
NAME:.metadata.name,\
INSTANCE:.metadata.labels.node\\.kubernetes\\.io/instance-type,\
CAPACITY:.metadata.labels.karpenter\\.sh/capacity-type

# Count nodes by type
kubectl get nodes --no-headers | wc -l
```

Set up billing alerts in GCP Console:
- Navigation: Billing → Budgets & alerts
- Recommended: Alert at 50%, 80%, 100% of budget

## Integration with KEDA

Karpenter and KEDA work together automatically:
- **KEDA**: Scales pods (1 → 50 based on metrics)
- **Karpenter**: Provisions nodes (when pods are pending)

To increase max pods beyond current 10:
```bash
# Edit k8s/keda-scaledobject.yaml
# Change: maxReplicaCount: 50

kubectl apply -f k8s/keda-scaledobject.yaml
```

## Next Steps

1. Run load tests: `./scripts/run-karpenter-test.sh`
2. Monitor costs in GCP Console
3. Tune NodePool settings based on results
4. Read full guide: [KARPENTER-SETUP.md](KARPENTER-SETUP.md)

## Cleanup (Optional)

To remove Karpenter:

```bash
# Delete NodePools and NodeClasses
kubectl delete nodepools --all
kubectl delete nodeclasses --all

# Uninstall Karpenter
helm uninstall karpenter -n karpenter

# Delete namespace
kubectl delete namespace karpenter

# Remove IAM bindings (optional)
# See KARPENTER-SETUP.md for detailed cleanup steps
```

## Resources

- Full guide: [KARPENTER-SETUP.md](KARPENTER-SETUP.md)
- Karpenter docs: https://karpenter.sh/
- KEDA docs: https://keda.sh/
- GKE Workload Identity: https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity

---

**Remember**: Karpenter on GKE is experimental. Monitor closely and be prepared to revert if needed.

