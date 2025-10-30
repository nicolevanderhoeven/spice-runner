# KEDA Quick Start Guide

This is a quick reference for installing and testing KEDA with Spice Runner.

## Prerequisites

- ✅ Kubernetes cluster running (GKE, EKS, etc.)
- ✅ `kubectl` configured
- ✅ `helm` installed
- ✅ `k6` installed for load testing
- ✅ Spice Runner deployed
- ✅ Observability stack running (Prometheus)

## Installation (3 Steps)

### Step 1: Install KEDA

```bash
./scripts/install-keda.sh
```

This script handles everything:
- Installs KEDA operator
- Applies ScaledObject configuration
- Removes conflicting HPA (if present)
- Verifies installation

**Manual alternative:**
```bash
# Install KEDA
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace

# Remove old HPA
kubectl delete hpa spice-runner-hpa -n default

# Apply ScaledObject
kubectl apply -f k8s/keda-scaledobject.yaml
```

### Step 2: Verify Installation

```bash
# Check KEDA pods
kubectl get pods -n keda

# Check ScaledObject
kubectl get scaledobject spice-runner-keda -n default

# Check current pods (might be zero!)
kubectl get pods -l app=spice-runner -n default
```

### Step 3: Run Load Test

```bash
# Automated test with monitoring
./scripts/run-hpa-test.sh

# Or specify test type
./scripts/run-hpa-test.sh spike    # Fast 5-min test
./scripts/run-hpa-test.sh quick    # Quick 3-min test
./scripts/run-hpa-test.sh standard # Full 15-min test
```

## What to Expect

### Before Test (Scaled to Zero)
```bash
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```
💰 **Cost: $0** - No pods running!

### During Test (Auto-Scaled)
```bash
$ kubectl get pods -l app=spice-runner
NAME                            READY   STATUS    RESTARTS   AGE
spice-runner-xxxxxxxxxx-aaaaa   2/2     Running   0          2m
spice-runner-xxxxxxxxxx-bbbbb   2/2     Running   0          1m
spice-runner-xxxxxxxxxx-ccccc   2/2     Running   0          45s
spice-runner-xxxxxxxxxx-ddddd   2/2     Running   0          30s
spice-runner-xxxxxxxxxx-eeeee   2/2     Running   0          15s
```
📈 **Scaled to 5+ pods** based on traffic!

### After Test (Scaled Back to Zero)
```bash
# Wait 5 minutes after load stops
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```
💰 **Cost: $0** - Back to zero pods!

## KEDA Configuration Summary

Your KEDA setup scales **0 to 10 pods** based on:

| Trigger | Threshold | Purpose |
|---------|-----------|---------|
| **HTTP Requests** | 50 req/s | Scale on actual traffic |
| **CPU** | 70% | Prevent CPU saturation |
| **Memory** | 75% | Prevent OOM |

**Scaling Behavior:**
- **Wake from zero:** 1 req/s triggers activation
- **Scale up:** Any trigger above threshold
- **Scale down:** 5 minutes after ALL triggers below threshold
- **Cold start:** ~20-30 seconds from zero to serving traffic

## Monitoring Commands

### Watch Scaling in Real-Time

```bash
# Monitor ScaledObject
watch kubectl get scaledobject spice-runner-keda

# Watch pods scaling
watch kubectl get pods -l app=spice-runner

# Watch resource usage
watch kubectl top pods -l app=spice-runner

# View KEDA logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator -f --tail=20
```

### Check Status

```bash
# ScaledObject details
kubectl describe scaledobject spice-runner-keda

# KEDA-managed HPA
kubectl get hpa -n default

# Recent events
kubectl get events --sort-by='.lastTimestamp' | grep -i keda
```

## Testing Scenarios

### Test 1: Scale from Zero
```bash
# Ensure at zero
kubectl scale deployment spice-runner --replicas=0

# Wait 1 minute
sleep 60

# Send request (triggers activation)
curl https://your-domain.com/spice/

# Watch pod appear
watch kubectl get pods -l app=spice-runner
```

### Test 2: Load-Based Scaling
```bash
# Run spike test (high load)
./scripts/run-hpa-test.sh spike

# Monitor scaling
watch kubectl get scaledobject spice-runner-keda
```

### Test 3: Scale to Zero
```bash
# Run quick test
./scripts/run-hpa-test.sh quick

# Wait for scale-down (5 minutes)
watch kubectl get pods -l app=spice-runner
# Should scale to zero after 5 min of no traffic
```

## Troubleshooting

### Pods Not Scaling

**Check ScaledObject:**
```bash
kubectl describe scaledobject spice-runner-keda
```

**Check Prometheus connectivity:**
```bash
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open: http://localhost:9090
# Query: sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

### Not Scaling to Zero

**Wait longer:**
- Default cooldown is 5 minutes
- Ensure NO traffic for full 5 minutes

**Force faster cooldown (testing only):**
```bash
kubectl patch scaledobject spice-runner-keda --type merge -p '
  spec:
    cooldownPeriod: 60
'
```

### KEDA Not Working

**Check KEDA pods:**
```bash
kubectl get pods -n keda
```

**Restart KEDA:**
```bash
kubectl rollout restart deployment keda-operator -n keda
kubectl rollout restart deployment keda-operator-metrics-apiserver -n keda
```

**View KEDA logs:**
```bash
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator --tail=100
```

## Uninstall KEDA

If you want to switch back to HPA:

```bash
# Delete ScaledObject
kubectl delete scaledobject spice-runner-keda -n default

# Uninstall KEDA
helm uninstall keda -n keda

# Re-apply HPA
kubectl apply -f k8s/hpa.yaml
```

## Cost Savings Calculator

**Scenario:** Dev/test environment with 8 hours of usage per day

### With HPA (minReplicas: 2)
- 24 hours × 2 pods = **48 pod-hours/day**
- 30 days = **1,440 pod-hours/month**
- At $0.10/pod-hour = **$144/month**

### With KEDA (minReplicaCount: 0)
- 8 hours × 2 pods (avg) = **16 pod-hours/day**
- 30 days = **480 pod-hours/month**
- At $0.10/pod-hour = **$48/month**

**💰 Savings: $96/month (67% reduction)**

## Next Steps

1. ✅ **Monitor in Grafana** - View scaling metrics in dashboards
2. ✅ **Set up alerts** - Alert on scaling events or errors
3. ✅ **Tune thresholds** - Adjust based on actual traffic patterns
4. ✅ **Add time-based scaling** - Pre-scale during known busy hours
5. ✅ **Consider Karpenter** - Add node-level autoscaling next

## Key Files

- `k8s/keda-scaledobject.yaml` - KEDA configuration
- `scripts/install-keda.sh` - Installation script
- `scripts/run-hpa-test.sh` - Load testing script (KEDA-aware)
- `KEDA-TESTING.md` - Comprehensive testing guide

## Resources

- [Full KEDA Testing Guide](./KEDA-TESTING.md) - Detailed documentation
- [KEDA Official Docs](https://keda.sh/docs/) - KEDA documentation
- [KEDA Scalers](https://keda.sh/docs/scalers/) - All available scalers
- [HPA Testing Guide](./HPA-TESTING.md) - Compare with HPA

---

**Need Help?**
- Check the [KEDA Testing Guide](./KEDA-TESTING.md) for detailed information
- View KEDA logs: `kubectl logs -n keda -l app.kubernetes.io/name=keda-operator`
- Check ScaledObject: `kubectl describe scaledobject spice-runner-keda`

