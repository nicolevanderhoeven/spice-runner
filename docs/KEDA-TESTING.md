# KEDA testing guide

This guide explains how to test KEDA (Kubernetes Event-Driven Autoscaling) for the Spice Runner application.

## What is KEDA

KEDA is a Kubernetes-based event-driven autoscaler that extends Kubernetes' native autoscaling capabilities. Unlike HPA which primarily scales based on CPU and memory, KEDA can scale based on the following:

- HTTP request rates
- Message queue depth
- Database connections
- Custom Prometheus metrics
- Time-based schedules (cron)
- 60+ other event sources

**Key features:**

- Scale to zero (save costs when idle)
- Event-driven scaling (based on actual workload)
- Multiple triggers (AND/OR logic)
- Simple configuration (no Custom Metrics API needed)

## Quick start

To install KEDA and run a test, use the following commands:

```bash
# 1. Install KEDA and apply ScaledObject
./scripts/install-keda.sh

# 2. Install k6 (if not already installed)
brew install k6  # macOS

# 3. Run the test
./scripts/run-hpa-test.sh
```

The script automatically detects KEDA and monitors scaling behavior including scale-to-zero.

---

## Installation

KEDA can be installed using either the automated script or manual steps.

### Method 1: Automated installation (recommended)

To install KEDA automatically, run the following command:

```bash
./scripts/install-keda.sh
```

This script performs the following tasks:

1. Check prerequisites (`kubectl`, `helm`)
2. Install KEDA operator via Helm
3. Apply ScaledObject configuration
4. Handle existing HPA (offers to remove it)
5. Verify installation
6. Show status and next steps

### Method 2: Manual installation

To install KEDA manually, complete the following steps.

**Step 1: Install KEDA**

```bash
# Add KEDA Helm repository
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

# Install KEDA
helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace \
  --wait
```

**Step 2: Verify KEDA installation**

```bash
# Check KEDA pods
kubectl get pods -n keda

# Expected output:
# NAME                                      READY   STATUS    RESTARTS   AGE
# keda-operator-xxxxxxxxxx-xxxxx            1/1     Running   0          1m
# keda-operator-metrics-apiserver-xxxxx     1/1     Running   0          1m
```

**Step 3: Remove existing HPA (if present)**

```bash
# KEDA creates its own HPA, so remove the old one
kubectl delete hpa spice-runner-hpa -n default
```

**Step 4: Apply KEDA ScaledObject**

```bash
kubectl apply -f k8s/keda-scaledobject.yaml
```

---

## KEDA configuration overview

The following section describes the ScaledObject specification for this project.

### ScaledObject specification

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: spice-runner-keda
spec:
  scaleTargetRef:
    name: spice-runner
  
  minReplicaCount: 0          # Scale to zero!
  maxReplicaCount: 10
  
  pollingInterval: 15         # Check metrics every 15s
  cooldownPeriod: 300         # Wait 5 min before scaling to zero
  
  triggers:
  # 1. HTTP Request Rate (from Prometheus)
  - type: prometheus
    metadata:
      query: sum(rate(nginx_http_requests_total[1m]))
      threshold: '50'          # Scale up when > 50 req/s
      activationThreshold: '1' # Wake from zero at 1 req/s
  
  # 2. CPU Utilization
  - type: cpu
    metricType: Utilization
    metadata:
      value: '70'              # Scale up when CPU > 70%
  
  # 3. Memory Utilization
  - type: memory
    metricType: Utilization
    metadata:
      value: '75'              # Scale up when Memory > 75%
```

### Scaling Triggers Explained

| Trigger | Purpose | Threshold | Activation |
|---------|---------|-----------|------------|
| **HTTP Requests** | Scale based on traffic | 50 req/s | 1 req/s |
| **CPU** | Prevent CPU saturation | 70% | N/A |
| **Memory** | Prevent OOM | 75% | N/A |

**Logic:** If ANY trigger exceeds threshold → scale up. If ALL triggers below threshold for 5 min → scale down (possibly to zero).

---

## Running Tests

### Quick Test

```bash
# Run with automatic service discovery
./scripts/run-hpa-test.sh

# Or specify URL
SERVICE_URL=https://your-domain.com ./scripts/run-hpa-test.sh
```

### Test Variants

```bash
# Standard test (15 min, gradual ramp)
./scripts/run-hpa-test.sh standard

# Spike test (5 min, aggressive load)
./scripts/run-hpa-test.sh spike

# Quick test (3 min, moderate load)
./scripts/run-hpa-test.sh quick
```

### What to Expect

**Initial State:**
```bash
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```
✅ **Starting at ZERO pods** (KEDA's killer feature!)

**After First Request:**
```bash
# Send first request (activates from zero)
$ curl https://your-domain.com/spice/

# ~10-30 seconds later
$ kubectl get pods -l app=spice-runner
NAME                            READY   STATUS    RESTARTS   AGE
spice-runner-xxxxxxxxxx-xxxxx   2/2     Running   0          25s
```

**During Load Test:**
```bash
# High traffic → scales to 8-10 pods
$ kubectl get pods -l app=spice-runner
NAME                            READY   STATUS    RESTARTS   AGE
spice-runner-xxxxxxxxxx-aaaaa   2/2     Running   0          5m
spice-runner-xxxxxxxxxx-bbbbb   2/2     Running   0          4m
spice-runner-xxxxxxxxxx-ccccc   2/2     Running   0          3m
...
```

**After Test (5 minutes of no traffic):**
```bash
$ kubectl get pods -l app=spice-runner
No resources found in default namespace.
```
✅ **Scaled back to ZERO** - saving costs!

---

## Monitoring KEDA

### Real-Time Monitoring

The test script opens a monitoring window automatically, but you can also monitor manually:

**Watch ScaledObject:**
```bash
watch kubectl get scaledobject spice-runner-keda -n default
```

**Watch KEDA-managed HPA:**
```bash
watch kubectl get hpa -n default
```

**Watch Pods:**
```bash
watch kubectl get pods -l app=spice-runner -n default
```

**Monitor Resource Usage:**
```bash
watch kubectl top pods -l app=spice-runner -n default
```

### Check KEDA Status

```bash
# View ScaledObject details
kubectl describe scaledobject spice-runner-keda -n default

# View KEDA operator logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator --tail=50 -f

# View KEDA metrics
kubectl get --raw /apis/external.metrics.k8s.io/v1beta1 | jq .
```

### Useful Commands

```bash
# Check if KEDA is running
kubectl get pods -n keda

# List all ScaledObjects
kubectl get scaledobjects -A

# View KEDA version
kubectl get deployment keda-operator -n keda -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check Prometheus connectivity (from KEDA)
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://prometheus.observability.svc.cluster.local:9090/api/v1/query?query=up
```

---

## Testing Scenarios

### Scenario 1: Scale from Zero

**Goal:** Test cold start behavior

```bash
# Ensure scaled to zero
kubectl scale deployment spice-runner --replicas=0

# Wait 1 minute
sleep 60

# Verify zero pods
kubectl get pods -l app=spice-runner
# Should show: No resources found

# Send first request (triggers activation)
curl https://your-domain.com/spice/

# Watch scaling from zero
watch kubectl get pods -l app=spice-runner
# Should see pod creating within 10-30 seconds
```

**Expected Timeline:**
- t=0: Request arrives, KEDA detects
- t=5s: Deployment scaled to 1 replica
- t=15-30s: Pod starts, becomes ready
- t=30s: Traffic served

### Scenario 2: Traffic-Based Scaling

**Goal:** Test HTTP request rate scaling

```bash
# Run load test
./scripts/run-hpa-test.sh standard

# Monitor request rate in Prometheus
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open: http://localhost:9090
# Query: rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m])
```

**Expected Behavior:**
- 0-50 req/s: Stays at 1-2 pods
- 50-100 req/s: Scales to 3-4 pods
- 100-200 req/s: Scales to 6-8 pods
- 200+ req/s: Scales toward max (10 pods)

### Scenario 3: CPU/Memory Scaling

**Goal:** Ensure resource-based scaling still works

```bash
# Generate CPU load (if HTTP load isn't enough)
kubectl run stress-test --image=polinux/stress --restart=Never -- \
  stress --cpu 4 --timeout 300s

# Or adjust CPU request lower to make threshold easier to reach
kubectl patch deployment spice-runner -p '
  spec:
    template:
      spec:
        containers:
        - name: spice-runner
          resources:
            requests:
              cpu: "10m"
'

# Run test
./scripts/run-hpa-test.sh spike
```

### Scenario 4: Scale-to-Zero After Traffic

**Goal:** Verify cost-saving scale-down behavior

```bash
# Run quick test
./scripts/run-hpa-test.sh quick

# Wait for test to complete, monitor scale-down
watch kubectl get pods -l app=spice-runner

# Timeline:
# t=0: Test ends
# t=0-5min: Pods still running (cooldown period)
# t=5min: KEDA scales to zero
# t=5min+: No pods running (cost = $0)
```

### Scenario 5: Multiple Triggers

**Goal:** Test that ANY trigger can scale up

```bash
# Start with zero pods
kubectl scale deployment spice-runner --replicas=0

# Trigger 1: Send HTTP traffic (should scale up)
./scripts/run-hpa-test.sh quick

# OR Trigger 2: Increase CPU (should also scale up)
# This happens automatically during load

# OR Trigger 3: Increase memory
# This happens automatically during load
```

---

## Comparing KEDA vs HPA

### Side-by-Side Test

```bash
# Test HPA
kubectl apply -f k8s/hpa.yaml
kubectl delete scaledobject spice-runner-keda
./scripts/run-hpa-test.sh standard

# Switch to KEDA
kubectl delete hpa spice-runner-hpa
kubectl apply -f k8s/keda-scaledobject.yaml
./scripts/run-hpa-test.sh standard
```

### Key Differences

| Metric | HPA | KEDA |
|--------|-----|------|
| **Minimum pods** | 2 | 0 |
| **Scale-up trigger** | CPU > 70% | HTTP > 50 req/s OR CPU > 70% |
| **Scale-up time** | 1-2 min | 30-60 sec |
| **Scale-down time** | 5+ min to min | 5 min to zero |
| **Cold start** | N/A | 10-30 sec |
| **Cost (idle)** | 2 pods 24/7 | $0 when idle |
| **Metrics source** | Metrics Server | Prometheus + Metrics Server |

---

## Troubleshooting

### Issue: ScaledObject Not Scaling

**Check ScaledObject status:**
```bash
kubectl describe scaledobject spice-runner-keda -n default
```

**Common causes:**
1. Prometheus not accessible
2. Query returning null/no data
3. Metrics below activation threshold

**Fix:**
```bash
# Test Prometheus query manually
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open: http://localhost:9090
# Run: sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

### Issue: Pods Not Scaling to Zero

**Check:**
1. Is cooldownPeriod elapsed? (default 5 minutes)
2. Are all triggers below threshold?
3. Is traffic actually zero?

```bash
# Force scale to zero for testing
kubectl patch scaledobject spice-runner-keda -n default --type merge -p '
  spec:
    cooldownPeriod: 60
'

# Wait 1 minute with no traffic
```

### Issue: KEDA Operator Not Running

```bash
# Check KEDA pods
kubectl get pods -n keda

# Check operator logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator

# Restart KEDA
kubectl rollout restart deployment keda-operator -n keda
```

### Issue: Slow Cold Start

**Expected:** 10-30 seconds from zero to ready

**If slower:**
```bash
# Check pod startup time
kubectl describe pod <pod-name> -n default | grep -A 10 Events

# Speed up by using smaller images or readiness probes
```

**Optimize:**
- Use image pull policy: `IfNotPresent`
- Reduce readiness probe `initialDelaySeconds`
- Pre-warm with `minReplicaCount: 1` during high-traffic hours

### Issue: Metrics Showing "Unknown"

```bash
# Check KEDA metrics server
kubectl get apiservice v1beta1.external.metrics.k8s.io

# Should show:
# NAME                              SERVICE                              AVAILABLE
# v1beta1.external.metrics.k8s.io   keda/keda-operator-metrics-apiserver   True

# If not available, reinstall KEDA
helm upgrade --install keda kedacore/keda --namespace keda
```

---

## Production Considerations

### Cost Optimization

**Scale-to-Zero Strategy:**
```yaml
# Use scale-to-zero for:
# - Dev/test environments
# - Low-traffic apps
# - Scheduled workloads
# - Internal tools

spec:
  minReplicaCount: 0
  cooldownPeriod: 300  # 5 min
```

**Baseline Strategy:**
```yaml
# Use baseline replicas for:
# - Production user-facing apps
# - Latency-sensitive services
# - High-traffic apps

spec:
  minReplicaCount: 2   # High availability
  cooldownPeriod: 600  # 10 min (conservative)
```

### Advanced Configuration

**Time-Based Scaling (Business Hours):**
```yaml
triggers:
# Scale up during business hours
- type: cron
  metadata:
    timezone: America/New_York
    start: 0 8 * * 1-5      # 8 AM Mon-Fri
    end: 0 18 * * 1-5       # 6 PM Mon-Fri
    desiredReplicas: '5'

# HTTP-based scaling
- type: prometheus
  metadata:
    query: rate(nginx_http_requests_total[1m])
    threshold: '100'
```

**Multiple Prometheus Metrics:**
```yaml
triggers:
# Traffic-based
- type: prometheus
  metadata:
    query: rate(http_requests_total[1m])
    threshold: '100'

# Latency-based
- type: prometheus
  metadata:
    query: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[2m]))
    threshold: '0.5'  # Scale if p95 latency > 500ms

# Error rate-based
- type: prometheus
  metadata:
    query: rate(http_requests_total{status=~"5.."}[1m]) / rate(http_requests_total[1m])
    threshold: '0.01'  # Scale if error rate > 1%
```

### Monitoring & Alerts

**Prometheus AlertManager Rules:**
```yaml
# Alert if KEDA not scaling
- alert: KEDANotScaling
  expr: keda_scaler_errors_total > 0
  for: 5m
  annotations:
    summary: "KEDA scaler errors detected"

# Alert if at max replicas
- alert: KEDAMaxReplicasReached
  expr: keda_scaledobject_replicas >= keda_scaledobject_max_replicas
  for: 10m
  annotations:
    summary: "Application at maximum replicas"
```

**Grafana Dashboard:**
- Pod count over time
- Scaling events timeline
- Trigger metrics (HTTP rate, CPU, memory)
- Cold start latency (p50, p95, p99)
- Cost savings (pod-hours saved vs HPA)

---

## Performance Benchmarks

### Scaling Speed

**Scale Up (0 → 1 pod):**
- KEDA activation: 5-10 seconds
- Pod startup: 15-25 seconds
- **Total: 20-35 seconds**

**Scale Up (1 → 10 pods):**
- KEDA + HPA: 60-120 seconds
- Similar to HPA alone

**Scale Down (10 → 0):**
- Cooldown period: 300 seconds (5 min)
- Scale down: 30-60 seconds
- **Total: 330-360 seconds**

### Cost Savings Example

**Scenario:** Dev environment, traffic 9 AM - 5 PM weekdays

**HPA (minReplicas: 2):**
- Running: 24 hours × 7 days × 2 pods = 336 pod-hours/week
- Cost: $33.60/week (assuming $0.10/pod-hour)

**KEDA (minReplicaCount: 0):**
- Running: 8 hours × 5 days × 2 pods (avg) = 80 pod-hours/week
- Cost: $8.00/week
- **Savings: $25.60/week (76% reduction)**

---

## Next Steps

After validating KEDA:

1. **Set up monitoring** - Create Grafana dashboards for KEDA metrics
2. **Configure alerts** - Alert on scaling events, errors, max replicas
3. **Optimize triggers** - Fine-tune thresholds based on traffic patterns
4. **Add custom metrics** - Scale on business metrics (sessions, orders, etc.)
5. **Consider Karpenter** - Add node-level autoscaling for complete efficiency
6. **Document runbooks** - Cold start mitigation, scaling troubleshooting

## Resources

- [KEDA Documentation](https://keda.sh/docs/)
- [KEDA Scalers](https://keda.sh/docs/scalers/)
- [KEDA GitHub](https://github.com/kedacore/keda)
- [k6 Load Testing](https://k6.io/docs/)
- [Prometheus Queries](https://prometheus.io/docs/prometheus/latest/querying/basics/)

---

## FAQ

**Q: Can I use KEDA and HPA together?**
A: Yes, but typically not on the same deployment. KEDA creates its own HPA under the hood. However, you can use HPA for one deployment and KEDA for another in the same cluster.

**Q: Does scale-to-zero work with StatefulSets?**
A: Yes! KEDA supports Deployments, StatefulSets, and Custom Resources.

**Q: What happens if Prometheus goes down?**
A: KEDA will use the `fallback` configuration (we set it to 2 replicas). The app stays available.

**Q: Can I scale based on multiple metrics with AND logic?**
A: No, KEDA uses OR logic (any trigger can scale up). Use a single Prometheus query with AND logic in PromQL instead.

**Q: How does KEDA handle cold starts?**
A: KEDA activates the deployment when `activationThreshold` is met. Pod startup time depends on your image size and readiness probes (typically 10-30s for Spice Runner).

**Q: Should I use KEDA in production?**
A: Yes! KEDA is CNCF graduated project used by many companies. For production, use `minReplicaCount: 2` for HA and tune `cooldownPeriod` conservatively.


