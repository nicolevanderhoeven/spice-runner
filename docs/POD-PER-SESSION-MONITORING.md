# Pod-Per-Session Monitoring Quick Reference

## Quick Health Checks

### 1. Check Current Pod Count

```bash
kubectl get pods -l app=spice-runner -n default
```

### 2. Check KEDA Status

```bash
kubectl get scaledobject spice-runner-keda -n default
```

Expected output:
```
NAME                  SCALETARGETKIND      SCALETARGETNAME   MIN   MAX   TRIGGERS     READY   ACTIVE
spice-runner-keda     apps/v1.Deployment   spice-runner      0     200   prometheus   True    True
```

### 3. Check HPA Metrics

```bash
kubectl get hpa -n default
```

### 4. View Real-Time Scaling

```bash
watch -n 2 'echo "=== Pods ===" && kubectl get pods -l app=spice-runner -n default | wc -l && echo "=== Nodes ===" && kubectl get nodes --no-headers | wc -l'
```

## Prometheus Queries

Access Prometheus:
```bash
kubectl port-forward -n observability svc/prometheus 9090:9090
```

Then open http://localhost:9090 and use these queries:

### Active Game Sessions (Approximation)

```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

**Interpretation**: This is the current HTTP request rate, which approximates active sessions (each session generates ~1 req/s).

### Running Pods

```promql
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Interpretation**: Number of currently running spice-runner pods.

### Sessions Per Pod Ratio

```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
/
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Expected Value**: Should be close to 1.0 (indicating 1:1 scaling is working)

### Heartbeat Event Rate

```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx", status="200"}[1m]))
```

**Interpretation**: Rate of successful requests, including heartbeats.

### Node Count

```promql
count(kube_node_info)
```

**Interpretation**: Total nodes in the cluster (should increase as pods scale up).

### Pod Pending Time

```promql
sum(kube_pod_status_phase{pod=~"spice-runner-.*", phase="Pending"})
```

**Interpretation**: Number of pods waiting for nodes (indicates if Karpenter needs to add nodes).

## Grafana Dashboard

Add these panels to visualize 1:1 scaling:

### Panel 1: Active Sessions vs Pods

**Query A** (Active Sessions):
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

**Query B** (Pod Count):
```promql
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Visualization**: Time series graph with both lines
**Expected**: Lines should track closely together

### Panel 2: Scaling Efficiency

**Query**:
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
/
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Visualization**: Gauge
**Target**: 1.0 (perfect 1:1 ratio)
**Thresholds**:
- Green: 0.8 - 1.2 (good)
- Yellow: 0.5 - 0.8 or 1.2 - 1.5 (acceptable)
- Red: < 0.5 or > 1.5 (needs adjustment)

### Panel 3: Cluster Growth

**Query**:
```promql
count(kube_node_info)
```

**Visualization**: Stat panel
**Shows**: Current node count

### Panel 4: Request Rate Per Pod

**Query**:
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m])) 
/ 
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Visualization**: Stat panel
**Expected**: ~1.0 req/s per pod

## Kubectl Monitoring Commands

### Watch Pods and Nodes Together

```bash
watch -n 2 '
echo "=== PODS (target: 1 per session) ===" && \
kubectl get pods -l app=spice-runner -n default && \
echo "" && \
echo "=== NODES ===" && \
kubectl get nodes && \
echo "" && \
echo "=== HPA ===" && \
kubectl get hpa -n default
'
```

### Monitor KEDA Decision Making

```bash
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator -f | grep spice-runner
```

### View Scaling Events

```bash
kubectl get events -n default --sort-by='.lastTimestamp' | grep -i scale
```

### Check Heartbeat Events in Loki

Access Grafana:
```bash
kubectl port-forward -n observability svc/grafana 3000:3000
```

Open http://localhost:3000, go to Explore, select Loki, and run:

```logql
{job="faro"} | logfmt | event_name="game_session_heartbeat"
```

## Testing Scenarios

### Test 1: Single Session Test

**Objective**: Verify 1 session creates 1 pod

```bash
# Step 1: Ensure clean state
kubectl scale deployment spice-runner --replicas=0 -n default
sleep 30

# Step 2: Verify zero pods
kubectl get pods -l app=spice-runner -n default
# Expected: No resources found

# Step 3: Start monitoring
watch kubectl get pods -l app=spice-runner -n default &

# Step 4: Open game and play
echo "Open https://nvdh.dev/spice/ and start playing"

# Step 5: Wait and observe
echo "Watch for pod to appear within 30 seconds"

# Step 6: Stop playing
echo "Close the game"

# Step 7: Wait for scale down
echo "Pod should disappear after 30-60 seconds"
```

**Expected Result**:
- t=0s: 0 pods
- t=30s: 1 pod (Pending)
- t=45s: 1 pod (Running)
- t=120s: 0 pods (after closing game)

### Test 2: Multi-Session Test

**Objective**: Verify N sessions create N pods

```bash
# Step 1: Get baseline
BASELINE=$(kubectl get pods -l app=spice-runner -n default --no-headers | wc -l)
echo "Current pods: $BASELINE"

# Step 2: Open multiple sessions
echo "Open 5 browser tabs to https://nvdh.dev/spice/ and start playing in each"

# Step 3: Monitor scaling
watch 'kubectl get pods -l app=spice-runner -n default --no-headers | wc -l'

# Step 4: Wait for stabilization
echo "Wait 2-3 minutes for all pods to be Running"

# Step 5: Count pods
FINAL=$(kubectl get pods -l app=spice-runner -n default --no-headers | wc -l)
echo "Final pods: $FINAL (Expected: $BASELINE + 5)"
```

**Expected Result**:
- Baseline + 5 pods (±1 pod variance is acceptable)

### Test 3: Load Test (Stress Test)

**Objective**: Test scaling to dozens of pods

```bash
# Step 1: Install k6 if needed
brew install k6

# Step 2: Run load test
cd scripts
k6 run -e SERVICE_URL=https://nvdh.dev --vus 30 --duration 3m hpa-load-test.js &

# Step 3: Monitor in real-time
watch -n 2 '
echo "Pods: $(kubectl get pods -l app=spice-runner -n default --no-headers | wc -l)" && \
echo "Nodes: $(kubectl get nodes --no-headers | wc -l)" && \
kubectl top nodes
'

# Step 4: Check metrics after test
kubectl get hpa -n default
kubectl get scaledobject spice-runner-keda -n default
```

**Expected Result**:
- 30 VUs → 25-35 pods
- Nodes scale accordingly
- No pod failures or CrashLoopBackOff

## Troubleshooting Queries

### No Pods Scaling Up

**Check 1**: Are heartbeats being sent?
```bash
kubectl logs -l app=spice-runner -n default -c alloy | grep heartbeat
```

**Check 2**: Is Prometheus scraping metrics?
```promql
nginx_http_requests_total{service="spice-runner-nginx"}
```

**Check 3**: Is KEDA querying Prometheus?
```bash
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator | grep "querying prometheus"
```

### Pods Not Scaling Down

**Check 1**: Is there still traffic?
```promql
rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m])
```

**Check 2**: Has cooldown period elapsed? (30 seconds)
```bash
kubectl describe scaledobject spice-runner-keda -n default | grep -i cooldown
```

**Check 3**: Are there zombie sessions?
```logql
{job="faro"} | logfmt | event_name="game_session_heartbeat" | status="active"
```

### Scaling Too Fast

**Adjust polling interval**:
```bash
kubectl edit scaledobject spice-runner-keda -n default
# Change pollingInterval from 5 to 10 or 15
```

### Scaling Too Slow

**Check 1**: Reduce activation threshold
```bash
kubectl edit scaledobject spice-runner-keda -n default
# Change activationThreshold from 0.2 to 0.1
```

**Check 2**: Reduce polling interval
```bash
# Change pollingInterval from 5 to 3
```

## Alert Rules

Create these Prometheus alert rules for production:

### Pod-to-Session Ratio Out of Range

```yaml
alert: PodSessionRatioAnomaly
expr: |
  abs(
    sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[5m]))
    /
    count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
    - 1
  ) > 0.5
for: 5m
labels:
  severity: warning
annotations:
  summary: "Pod-to-session ratio is off target"
  description: "Expected 1:1 ratio, currently {{ $value }}"
```

### KEDA Not Scaling

```yaml
alert: KEDANotResponding
expr: |
  changes(kube_deployment_status_replicas{deployment="spice-runner"}[10m]) == 0
  and
  rate(nginx_http_requests_total{service="spice-runner-nginx"}[5m]) > 5
for: 10m
labels:
  severity: critical
annotations:
  summary: "KEDA is not scaling despite load"
  description: "Request rate is {{ $value }} req/s but no scaling activity"
```

## Key Metrics Summary

| Metric | Target | Query |
|--------|--------|-------|
| Sessions per Pod | 1.0 | `sum(rate(nginx_http_requests_total[1m])) / count(kube_pod_status_phase{pod=~"spice-runner-.*", phase="Running"})` |
| Scale-up Time | < 30s | Manual observation |
| Scale-down Time | < 60s | Manual observation |
| Pod Success Rate | > 99% | `count(kube_pod_status_phase{phase="Running"}) / count(kube_pod_status_phase)` |
| Heartbeat Rate | ~0.2/s per session | `rate({job="faro"} |= "game_session_heartbeat"[1m])` |

## Quick Validation Checklist

✅ KEDA ScaledObject shows READY=True and ACTIVE=True
✅ Pods start with 0 (minReplicaCount=0)
✅ Playing game increases pod count within 30 seconds
✅ Pod count ≈ active session count (±20%)
✅ Stopping game decreases pod count within 60 seconds
✅ Prometheus has nginx_http_requests_total metric
✅ Loki shows game_session_heartbeat events
✅ No CrashLoopBackOff or Pending pods
✅ Nodes scale up when pods pending
✅ Nodes scale down when utilization low

---

**Related Documentation**:
- [Pod-Per-Session Scaling Guide](./POD-PER-SESSION-SCALING.md)
- [KEDA Quick Start](./KEDA-QUICKSTART.md)
- [HPA Testing](./HPA-TESTING.md)

