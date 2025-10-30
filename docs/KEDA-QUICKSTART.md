# KEDA quick start guide

This guide provides a quick reference for installing and testing KEDA with Spice Runner.

## Prerequisites

Before you begin, ensure you have the following:

- Kubernetes cluster running (GKE, EKS, etc.)
- `kubectl` configured
- `helm` installed
- `k6` installed for load testing
- Spice Runner deployed
- Observability stack running (Prometheus)

## Installation

Follow these three steps to install and test KEDA.

### Step 1: Install KEDA

To install KEDA, run the following command:



```bash
./scripts/install-keda.sh
```

This script handles the following tasks:

- Installs KEDA operator
- Applies ScaledObject configuration
- Removes conflicting HPA (if present)
- Verifies installation

**Manual alternative**:

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

### Step 2: Verify installation

To verify the installation, run the following commands:

```bash
# Check KEDA pods
kubectl get pods -n keda

# Check ScaledObject
kubectl get scaledobject spice-runner-keda -n default

# Check current pods (might be zero!)
kubectl get pods -l app=spice-runner -n default
```

### Step 3: Run load test

To run a load test, use the following commands:

```bash
# Automated test with monitoring
./scripts/run-hpa-test.sh

# Or specify test type
./scripts/run-hpa-test.sh spike    # Fast 5-min test
./scripts/run-hpa-test.sh quick    # Quick 3-min test
./scripts/run-hpa-test.sh standard # Full 15-min test
```

## What to expect

KEDA enables scale-to-zero capability for cost optimization.

### Before test (scaled to zero)

```bash
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```

**Cost**: $0 - No pods running

### During test (auto-scaled)

```bash
$ kubectl get pods -l app=spice-runner
NAME                            READY   STATUS    RESTARTS   AGE
spice-runner-xxxxxxxxxx-aaaaa   2/2     Running   0          2m
spice-runner-xxxxxxxxxx-bbbbb   2/2     Running   0          1m
spice-runner-xxxxxxxxxx-ccccc   2/2     Running   0          45s
spice-runner-xxxxxxxxxx-ddddd   2/2     Running   0          30s
spice-runner-xxxxxxxxxx-eeeee   2/2     Running   0          15s
```

**Scaled to 5+ pods** based on traffic

### After test (scaled back to zero)

```bash
# Wait 5 minutes after load stops
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```

**Cost**: $0 - Back to zero pods

## KEDA configuration summary

Your KEDA setup scales **0 to 10 pods** based on:

| Trigger | Threshold | Purpose |
|---------|-----------|---------|
| **HTTP Requests** | 50 req/s | Scale on actual traffic |
| **CPU** | 70% | Prevent CPU saturation |
| **Memory** | 75% | Prevent OOM |

**Scaling behavior:**

- **Wake from zero**: 1 req/s triggers activation
- **Scale up**: Any trigger above threshold
- **Scale down**: 5 minutes after all triggers below threshold
- **Cold start**: Approximately 20-30 seconds from zero to serving traffic

## Monitoring commands

Use these commands to monitor KEDA scaling behavior.

### Watch scaling in real-time

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

### Check status

To check KEDA status, run the following commands:

```bash
# ScaledObject details
kubectl describe scaledobject spice-runner-keda

# KEDA-managed HPA
kubectl get hpa -n default

# Recent events
kubectl get events --sort-by='.lastTimestamp' | grep -i keda
```

## Testing scenarios

Use these scenarios to test different KEDA capabilities.

### Test 1: Scale from zero
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

### Test 2: Load-based scaling
```bash
# Run spike test (high load)
./scripts/run-hpa-test.sh spike

# Monitor scaling
watch kubectl get scaledobject spice-runner-keda
```

### Test 3: Scale to zero
```bash
# Run quick test
./scripts/run-hpa-test.sh quick

# Wait for scale-down (5 minutes)
watch kubectl get pods -l app=spice-runner
# Should scale to zero after 5 min of no traffic
```

## Troubleshooting

This section helps you diagnose common KEDA issues.

### Pods not scaling

To check the ScaledObject, run the following command:

```bash
kubectl describe scaledobject spice-runner-keda
```

To check Prometheus connectivity, run the following command:

```bash
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open: http://localhost:9090
# Query: sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

### Not scaling to zero

If pods don't scale to zero, try the following:

**Wait longer**:

- Default cooldown is 5 minutes
- Ensure no traffic for full 5 minutes

**Force faster cooldown (testing only)**:

```bash
kubectl patch scaledobject spice-runner-keda --type merge -p '
  spec:
    cooldownPeriod: 60
'
```

### KEDA not working

To check KEDA pods, run the following command:

```bash
kubectl get pods -n keda
```

To restart KEDA, run the following commands:

```bash
kubectl rollout restart deployment keda-operator -n keda
kubectl rollout restart deployment keda-operator-metrics-apiserver -n keda
```

To view KEDA logs, run the following command:

```bash
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator --tail=100
```

## Uninstall KEDA

If you want to switch back to HPA, run the following commands:

```bash
# Delete ScaledObject
kubectl delete scaledobject spice-runner-keda -n default

# Uninstall KEDA
helm uninstall keda -n keda

# Re-apply HPA
kubectl apply -f k8s/hpa.yaml
```

## Cost savings calculator

**Scenario**: Development/test environment with 8 hours of usage per day

### With HPA (minReplicas: 2)

- 24 hours × 2 pods = **48 pod-hours/day**
- 30 days = **1,440 pod-hours/month**
- At $0.10/pod-hour = **$144/month**

### With KEDA (minReplicaCount: 0)

- 8 hours × 2 pods (average) = **16 pod-hours/day**
- 30 days = **480 pod-hours/month**
- At $0.10/pod-hour = **$48/month**

**Savings**: $96/month (67% reduction)

## Next steps

After successful installation, consider the following next steps:

1. **Monitor in Grafana**: View scaling metrics in dashboards
2. **Set up alerts**: Alert on scaling events or errors
3. **Tune thresholds**: Adjust based on actual traffic patterns
4. **Add time-based scaling**: Pre-scale during known busy hours
5. **Consider Karpenter**: Add node-level autoscaling next

## Key files

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

