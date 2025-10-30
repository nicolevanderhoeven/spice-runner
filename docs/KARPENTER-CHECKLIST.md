# Karpenter installation checklist

Use this checklist to ensure a successful Karpenter installation on Google Kubernetes Engine (GKE).

## Pre-installation checklist

Before you begin, verify the following prerequisites and cluster requirements.

### Prerequisites

- [ ] GKE cluster is running and accessible
- [ ] `kubectl` is installed and configured
- [ ] `gcloud` CLI is installed and authenticated
- [ ] `helm` 3.x is installed
- [ ] You have appropriate GCP IAM permissions

### Cluster requirements

- [ ] Workload Identity is enabled on cluster
- [ ] Cluster is VPC-native (uses alias IP ranges)
- [ ] You know your cluster name and region

### Verify cluster configuration

To verify your cluster configuration, run the following commands:

```bash
# Check cluster details
export CLUSTER_NAME="your-cluster-name"
export REGION="us-central1"
gcloud container clusters describe $CLUSTER_NAME --region=$REGION

# Verify Workload Identity
gcloud container clusters describe $CLUSTER_NAME \
  --region=$REGION \
  --format="value(workloadIdentityConfig.workloadPool)"
# Should output: <project-id>.svc.id.goog
```

- [ ] Workload Identity is enabled (output above is not empty)
- [ ] You have noted the cluster's network and subnetwork names

## Installation checklist

Follow these steps to install Karpenter.

### Step 1: Environment setup

To set up your environment variables, run the following commands:

```bash
export GCP_PROJECT_ID=$(gcloud config get-value project)
export CLUSTER_NAME="spice-runner-cluster"  # Your actual cluster name
export REGION="us-central1"                 # Your actual region
```

- [ ] Environment variables set
- [ ] Values are correct for your cluster

### Step 2: Run installation script

To install Karpenter, run the following command:

```bash
./scripts/install-karpenter-gke.sh
```

Wait for completion (~3-5 minutes)

- [ ] Script completed without errors
- [ ] Karpenter pods are running

### Step 3: Verify Karpenter installation

To verify the installation, run the following command:

```bash
kubectl get pods -n karpenter
```

The output should resemble the following:

```
NAME                         READY   STATUS    RESTARTS   AGE
karpenter-xxxxxxxxxx-xxxxx   1/1     Running   0          1m
```

- [ ] Karpenter pod is in `Running` state
- [ ] Pod is `1/1` Ready

### Step 4: Apply NodeClass configuration

To apply the NodeClass configuration, run the following commands:

```bash
# Update with your project ID
export GCP_PROJECT_ID=$(gcloud config get-value project)

# Apply configuration
envsubst < k8s/karpenter-nodeclass.yaml | kubectl apply -f -
```

- [ ] NodeClass applied successfully
- [ ] No error messages

### Step 5: Apply NodePool configuration

To apply the NodePool configuration, run the following command:

```bash
kubectl apply -f k8s/karpenter-nodepool.yaml
```

- [ ] NodePool applied successfully
- [ ] No error messages

### Step 6: Verify NodePools
```bash
kubectl get nodepools
```

Expected output:
```
NAME                AGE
default             1m
cost-optimized      1m
high-performance    1m
```

- [ ] All three NodePools are listed
- [ ] No error conditions

### Step 7: Check Karpenter Logs
```bash
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter --tail=50
```

- [ ] No error messages in logs
- [ ] Logs show Karpenter is watching for pods

## Testing checklist

Follow these tests to verify Karpenter is working correctly.

### Basic functionality test

```bash
# Scale up deployment
kubectl scale deployment spice-runner --replicas=10
```

- [ ] Pods are being created
- [ ] Some pods may be pending (if not enough capacity)

```bash
# Check if Karpenter provisions nodes (wait ~60s)
kubectl get nodes -w
```

- [ ] New node(s) appear within 60-90 seconds
- [ ] Nodes have label `karpenter.sh/initialized=true`

```bash
# Check pending pods become running
kubectl get pods
```

- [ ] All pods transition to `Running` state
- [ ] Pods are distributed across nodes

### Node consolidation test

```bash
# Scale down deployment
kubectl scale deployment spice-runner --replicas=1
```

- [ ] Pods scale down to 1

```bash
# Watch nodes (wait ~30-60s)
kubectl get nodes -w
```

- [ ] After ~30s, underutilized nodes start being removed
- [ ] Node count decreases
- [ ] Remaining pod(s) continue running

### Load Test (Optional but Recommended)

```bash
./scripts/run-karpenter-test.sh
```

- [ ] Test script runs successfully
- [ ] Can trigger node provisioning
- [ ] Can observe node consolidation
- [ ] Cluster returns to baseline after tests

## Post-installation checklist

After installation, complete the following tasks.

### Documentation
- [ ] Read [KARPENTER-SETUP.md](KARPENTER-SETUP.md) for detailed configuration
- [ ] Bookmark [KARPENTER-QUICKSTART.md](KARPENTER-QUICKSTART.md) for quick reference
- [ ] Review [KARPENTER-IMPLEMENTATION-SUMMARY.md](KARPENTER-IMPLEMENTATION-SUMMARY.md)

### Cost management

- [ ] Set up billing alerts in GCP Console
  - Navigation: **Billing** then **Budgets & alerts**
  - Recommended thresholds: 50%, 80%, 100%
- [ ] Review NodePool limits in `k8s/karpenter-nodepool.yaml`
- [ ] Consider enabling spot instances for cost savings

### Monitoring setup
- [ ] Bookmark Karpenter logs command:
  ```bash
  kubectl logs -f -n karpenter -l app.kubernetes.io/name=karpenter
  ```
- [ ] Set up dashboard to monitor:
  - Node count over time
  - Pod count over time
  - CPU/memory utilization
  - Cost metrics

### Integration with KEDA
- [ ] KEDA is installed and working
- [ ] ScaledObject is configured
- [ ] Test full autoscaling chain:
  - Traffic → KEDA scales pods → Karpenter provisions nodes

### Configuration tuning
- [ ] Review instance types in NodePools
- [ ] Adjust consolidation policies if needed
- [ ] Set appropriate resource limits
- [ ] Configure node expiration timing

## Verification commands

To confirm everything is working, run the following commands:

```bash
# 1. Check all Karpenter resources
kubectl get nodepools,nodeclasses,nodeclaims

# 2. Describe default NodePool
kubectl describe nodepool default

# 3. Check node labels
kubectl get nodes --show-labels | grep karpenter

# 4. View Karpenter metrics (optional)
kubectl port-forward -n karpenter svc/karpenter 8080:8080
# Then visit: http://localhost:8080/metrics

# 5. Check events
kubectl get events --sort-by='.lastTimestamp' | grep -i karpenter
```

## Troubleshooting checklist

Use this checklist to diagnose common issues.

### If Karpenter pods won't start:
- [ ] Check logs: `kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter`
- [ ] Verify service account: `kubectl get sa karpenter -n karpenter`
- [ ] Check IAM bindings in GCP Console
- [ ] Verify Workload Identity annotation

### If nodes aren't being created:
- [ ] Check GCP quotas: `gcloud compute project-info describe --project=$GCP_PROJECT_ID`
- [ ] Verify NodePool requirements match pod requirements
- [ ] Check Karpenter logs for error messages
- [ ] Ensure IAM roles are correctly assigned

### If nodes aren't being removed:
- [ ] Verify consolidation policy: `kubectl get nodepool default -o jsonpath='{.spec.disruption.consolidationPolicy}'`
- [ ] Check for pod disruption budgets blocking eviction
- [ ] Look for do-not-evict annotations on pods
- [ ] Review Karpenter logs for consolidation decisions

### If costs are higher than expected:
- [ ] Review instance types: `kubectl get nodes -o wide`
- [ ] Check NodePool limits
- [ ] Verify consolidation is working
- [ ] Consider enabling spot instances
- [ ] Check for stuck nodes

## Success criteria

Your Karpenter installation is successful if the following conditions are met:

- Karpenter pods are running in `karpenter` namespace  
- NodePools are created and visible  
- Scaling deployment triggers node provisioning  
- New nodes appear within 60 seconds  
- Nodes have Karpenter labels  
- Scale-down triggers node consolidation  
- Nodes are removed within 60 seconds of underutilization  
- No persistent errors in Karpenter logs  
- Integration with KEDA works seamlessly  

## Next actions

After successful installation:

1. **Run comprehensive tests**
   ```bash
   ./scripts/run-karpenter-test.sh
   ```

2. **Set up monitoring**
   - Create Grafana dashboard for node counts
   - Monitor costs in GCP Console
   - Set up alerts for unusual behavior

3. **Document your findings**
   - Note any issues encountered
   - Record optimal configuration for your workload
   - Share learnings with the team

4. **Optimize configuration**
   - Tune based on actual usage patterns
   - Adjust instance types as needed
   - Fine-tune consolidation timing

## Support resources

- **Karpenter Documentation**: https://karpenter.sh/
- **GitHub Issues**: https://github.com/aws/karpenter/issues
- **GKE Workload Identity**: https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity
- **Local Documentation**: 
  - [KARPENTER-SETUP.md](KARPENTER-SETUP.md)
  - [KARPENTER-QUICKSTART.md](KARPENTER-QUICKSTART.md)

## Notes

{{< admonition type="warning" >}}
Karpenter on GKE is not production-ready. This is an experimental setup for testing and demonstration purposes only.
{{< /admonition >}}

Important considerations:

- **Monitor costs**: Set up billing alerts immediately
- **Iterate**: Tune configuration based on real usage
- **Document**: Keep notes on what works and what doesn't

---

**Installation Date**: _____________  
**Installed By**: _____________  
**Cluster Name**: _____________  
**GCP Project**: _____________

