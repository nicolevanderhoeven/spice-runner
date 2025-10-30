# HPA testing guide

This guide explains how to test the Horizontal Pod Autoscaler (HPA) for the Spice Runner application using k6 load tests.

## Quick start

You can run a load test with three commands:

```bash
# 1. Apply HPA
kubectl apply -f k8s/hpa.yaml

# 2. Install k6 (if not already installed)
brew install k6  # macOS

# 3. Run the test
./scripts/run-hpa-test.sh
```

The automated script detects your service URL, generates realistic load, and monitors HPA scaling in real-time.

## Prerequisites

Before you begin, ensure the following prerequisites are met.

### Metrics Server

HPA requires Kubernetes Metrics Server to be installed in your cluster.

To check if metrics-server is running, run the following command:

```bash
kubectl get deployment metrics-server -n kube-system
```

If missing, install metrics-server by running the following command:

```bash
# For most clusters
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# For GKE, metrics-server is pre-installed
```

To verify metrics are available, run the following commands:

```bash
kubectl top nodes
kubectl top pods -n default
```

### Install k6

k6 is a modern load testing tool that runs outside your cluster to generate realistic traffic.

To install k6, run the following command for your operating system:

```bash
# macOS
brew install k6

# Linux (Ubuntu/Debian)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6

# Verify installation
k6 version
```

**Alternative**: Download from [k6.io/docs/get-started/installation](https://k6.io/docs/get-started/installation/)

### Apply HPA configuration

To apply the HPA configuration, run the following command:

```bash
kubectl apply -f k8s/hpa.yaml
```

To verify HPA is created, run the following commands:

```bash
kubectl get hpa -n default
kubectl describe hpa spice-runner-hpa -n default
```

The output should resemble the following:

```
NAME                REFERENCE                 TARGETS         MINPODS   MAXPODS   REPLICAS
spice-runner-hpa    Deployment/spice-runner   5%/70%, 10%/75%   2         10        2
```

### Get your service URL

Determine how to access your application by running the following commands:

```bash
# Option 1: Check Ingress (if using)
kubectl get ingress -n default
# Note the host URL (e.g., https://your-domain.com)

# Option 2: Check LoadBalancer (if using)
kubectl get svc spice-runner -n default
# Note the EXTERNAL-IP

# Option 3: Use port-forward for local testing
kubectl port-forward -n default svc/spice-runner 8080:80
# Use http://localhost:8080
```

## HPA Configuration Overview

### Scaling Triggers
- **CPU Utilization**: 70% average
- **Memory Utilization**: 75% average

### Replica Bounds
- **Minimum**: 2 pods (high availability)
- **Maximum**: 10 pods (cost protection)

### Scaling Behavior
- **Scale Up**: 60s stabilization, adds up to 50% or 2 pods
- **Scale Down**: 300s stabilization, removes up to 50% or 1 pod

## Running Load Tests

### Option 1: Automated Test with Monitoring (Easiest)

The `run-hpa-test.sh` script handles everything:

**For production/external URLs:**
```bash
# Auto-detect service URL from ingress/LoadBalancer
./scripts/run-hpa-test.sh

# Or specify URL explicitly
SERVICE_URL=https://your-domain.com ./scripts/run-hpa-test.sh
```

**For local testing:**
```bash
# In one terminal, set up port-forward
kubectl port-forward -n default svc/spice-runner 8080:80

# In another terminal, run test
SERVICE_URL=http://localhost:8080 ./scripts/run-hpa-test.sh
```

**Test variants:**
```bash
# Standard test (15 min, gradual ramp: 50→100→200→100→0 VUs)
./scripts/run-hpa-test.sh

# Spike test (5 min, aggressive: 0→150→0 VUs)
./scripts/run-hpa-test.sh spike

# Quick test (3 min, moderate: 50 VUs)
./scripts/run-hpa-test.sh quick
```

**What the script does:**
1. ✅ Validates prerequisites (k6, kubectl, HPA)
2. 🔍 Auto-detects service URL (or uses provided URL)
3. 📊 Shows current HPA and pod status
4. 🚀 Starts k6 load test
5. 📈 Opens real-time monitoring in separate terminal (macOS/Linux)
6. 📝 Exports results to `/tmp/k6-results.json`
7. 📋 Displays summary and next steps

### Option 2: Run k6 Tests Directly

For more control or CI/CD integration:

**Standard load test (15 minutes):**
```bash
k6 run -e SERVICE_URL=https://your-domain.com scripts/hpa-load-test.js
```

**Spike test (5 minutes):**
```bash
k6 run -e SERVICE_URL=https://your-domain.com scripts/hpa-spike-test.js
```

**Custom parameters:**
```bash
# Run with custom duration and VUs
k6 run --duration 10m --vus 150 \
  -e SERVICE_URL=https://your-domain.com \
  scripts/hpa-load-test.js

# Export results to different formats
k6 run -e SERVICE_URL=https://your-domain.com \
  --out json=results.json \
  --out csv=results.csv \
  scripts/hpa-load-test.js

# Run with cloud output (k6 Cloud)
k6 run --out cloud -e SERVICE_URL=https://your-domain.com \
  scripts/hpa-load-test.js
```

**k6 test details:**

`hpa-load-test.js` - Realistic 15-minute test:
- Stage 1: Ramp to 50 VUs (2 min)
- Stage 2: Ramp to 100 VUs (5 min)
- Stage 3: Spike to 200 VUs (3 min)
- Stage 4: Back to 100 VUs (3 min)
- Stage 5: Ramp down to 0 (2 min)

`hpa-spike-test.js` - Fast 5-minute test:
- Stage 1: Ramp to 100 VUs (30 sec)
- Stage 2: Increase to 150 VUs (2 min)
- Stage 3: Hold at 150 VUs (2 min)
- Stage 4: Ramp down to 0 (30 sec)

### Option 3: Manual Monitoring While Testing

Open a separate terminal to monitor scaling while tests run:

```bash
# Watch HPA status (updates every 2 seconds)
watch kubectl get hpa spice-runner-hpa -n default

# Watch pods scaling
watch kubectl get pods -n default -l app=spice-runner

# Watch resource usage (CPU/Memory)
watch kubectl top pods -n default -l app=spice-runner

# View HPA events
watch "kubectl describe hpa spice-runner-hpa -n default | grep -A 20 'Events:'"

# All-in-one monitoring
watch "echo '=== HPA ===' && kubectl get hpa -n default && \
  echo && echo '=== Pods ===' && kubectl get pods -n default -l app=spice-runner && \
  echo && echo '=== Resources ===' && kubectl top pods -n default -l app=spice-runner"
```

---

## Step-by-Step Testing Guide

### Complete Testing Workflow

**Step 1: Verify prerequisites**
```bash
# Check metrics-server
kubectl top nodes

# Check HPA exists
kubectl get hpa spice-runner-hpa -n default

# Check k6 installed
k6 version
```

**Step 2: Check baseline state**
```bash
# View current pods (should be 2)
kubectl get pods -n default -l app=spice-runner

# View current resource usage
kubectl top pods -n default -l app=spice-runner

# View HPA status
kubectl get hpa spice-runner-hpa -n default
```

**Step 3: Start monitoring** (separate terminal)
```bash
watch kubectl get hpa spice-runner-hpa -n default
```

**Step 4: Run load test**
```bash
# For production
SERVICE_URL=https://your-domain.com ./scripts/run-hpa-test.sh

# For local testing
kubectl port-forward -n default svc/spice-runner 8080:80 &
SERVICE_URL=http://localhost:8080 ./scripts/run-hpa-test.sh
```

**Step 5: Observe scaling**
- Watch pod count increase as load rises
- Observe CPU/Memory percentages in HPA
- Note scaling events in HPA describe output

**Step 6: Wait for scale-down** (after test completes)
```bash
# Scale-down takes ~5 minutes after load stops
watch kubectl get pods -n default -l app=spice-runner
```

**Step 7: Review results**
```bash
# View HPA events
kubectl describe hpa spice-runner-hpa -n default

# View k6 results (if using automated script)
cat /tmp/k6-results.json | jq '.metrics'

# Check Grafana dashboard
kubectl get svc grafana -n observability
# Access Grafana and view Spice Runner dashboard
```

## What to Expect

### k6 Standard Test Timeline (15 minutes)

1. **Initial State** (t=0)
   - 2 pods running
   - Low CPU/memory usage

2. **Ramp Up Phase** (t=0-2min)
   - k6 ramps to 50 virtual users
   - CPU/memory starts increasing
   - HPA monitors but waits (stabilization window)

3. **Sustained Load Phase** (t=2-7min)
   - k6 increases to 100 virtual users
   - CPU consistently above 70% threshold
   - HPA triggers scale up within 60-90s
   - New pods start (2 → 4-6 pods)
   - Load distributes across pods

4. **Spike Phase** (t=7-10min)
   - k6 spikes to 200 virtual users
   - Heavy CPU/memory pressure
   - HPA may scale to 8-10 pods

5. **Cool Down** (t=10-12min)
   - k6 reduces to 100 virtual users
   - Resource usage normalizes

6. **Ramp Down** (t=12-15min)
   - k6 reduces to 0 virtual users
   - CPU/memory drops below threshold
   - HPA waits 5 minutes before scaling down

7. **Scale Down** (t=15-20min)
   - Gradually removes pods
   - Returns to minimum 2 pods

### k6 Spike Test Timeline (5 minutes)

- **Quick ramp** to 150 VUs in 30 seconds
- **Sustained spike** for 4 minutes
- **Triggers rapid HPA scaling** (2 → 6-10 pods)
- **Quick ramp down** in 30 seconds

### Sample k6 Output

**During test:**
```
     ✓ main page status is 200
     ✓ main page loads in < 500ms
     ✓ main page has content

     checks.........................: 98.50% ✓ 29550    ✗ 450
     data_received..................: 245 MB 16 MB/s
     data_sent......................: 2.5 MB 167 kB/s
     http_req_duration..............: avg=125ms  min=45ms  med=98ms   max=2.1s   p(95)=285ms p(99)=456ms
     http_reqs......................: 150000 10000/s
     successful_requests............: 98.50% ✓ 147750   ✗ 2250
     vus............................: 100    min=0      max=200
```

**HPA during test:**
```
NAME                REFERENCE                 TARGETS           MINPODS   MAXPODS   REPLICAS
spice-runner-hpa    Deployment/spice-runner   85%/70%, 45%/75%   2         10        6

Events:
  Type    Reason             Age   Message
  ----    ------             ----  -------
  Normal  SuccessfulRescale  3m    New size: 3; reason: cpu resource utilization above target
  Normal  SuccessfulRescale  2m    New size: 4; reason: cpu resource utilization above target
  Normal  SuccessfulRescale  1m    New size: 6; reason: cpu resource utilization above target
```

## Troubleshooting

### HPA shows "unknown" for metrics

**Problem:**
```
TARGETS         MINPODS   MAXPODS   REPLICAS
<unknown>/70%   2         10        2
```

**Solution:**
1. Ensure metrics-server is running
2. Wait 1-2 minutes for metrics to populate
3. Check if pods have resource requests defined (required for HPA)

```bash
kubectl get deployment spice-runner -n default -o yaml | grep -A 5 resources
```

### Pods not scaling

**Possible causes:**
1. Metrics below threshold (check with `kubectl top pods`)
2. HPA in stabilization window (wait 60s for scale up, 300s for scale down)
3. Already at min/max replicas
4. Resource requests not defined

**Debug:**
```bash
kubectl describe hpa spice-runner-hpa -n default
kubectl get events -n default --sort-by='.lastTimestamp'
```

### Scale-down takes too long

This is intentional! The HPA waits 5 minutes (300s) before scaling down to prevent flapping. This is a best practice.

### Load test not generating enough load

**Check if HPA sees increased metrics:**
```bash
kubectl top pods -n default -l app=spice-runner
kubectl get hpa spice-runner-hpa -n default
```

**Solutions:**
1. Run the spike test: `./scripts/run-hpa-test.sh spike`
2. Increase VUs: `k6 run --vus 300 -e SERVICE_URL=... scripts/hpa-load-test.js`
3. Run multiple tests simultaneously from different machines
4. Lower HPA thresholds temporarily (see Advanced Testing below)

### k6 test fails with connection errors

**Problem:**
```
WARN[0005] Request Failed   error="Get \"http://...\": dial tcp: connect: connection refused"
```

**Solutions:**
1. Verify service is accessible: `curl -I $SERVICE_URL/spice/`
2. Check service/ingress: `kubectl get svc,ingress -n default`
3. For local testing, ensure port-forward is running
4. Check firewall/network policies

## Advanced Testing

### Test Scale-Down Behavior

```bash
# Run spike test to trigger fast scale-up
./scripts/run-hpa-test.sh spike

# After test completes, monitor scale-down (takes ~5 min)
watch kubectl get pods -n default -l app=spice-runner

# View scale-down events
watch "kubectl describe hpa spice-runner-hpa -n default | tail -20"
```

### Test Maximum Replicas (Stress Test)

```bash
# Run with very high VU count to push to max replicas
k6 run --duration 10m --vus 300 \
  -e SERVICE_URL=https://your-domain.com \
  scripts/hpa-load-test.js

# Should see pods scale to or near maximum (10 pods)
```

### Test with Custom Metrics

```bash
# Override k6 test parameters
k6 run \
  --stage 30s:100 \
  --stage 5m:200 \
  --stage 30s:0 \
  -e SERVICE_URL=https://your-domain.com \
  scripts/hpa-load-test.js
```

### Simulate Memory Pressure

```bash
# Update HPA to have lower memory threshold temporarily
kubectl patch hpa spice-runner-hpa -n default --type='json' \
  -p='[{"op": "replace", "path": "/spec/metrics/1/resource/target/averageUtilization", "value": 50}]'

# Restore original value after testing
kubectl apply -f k8s/hpa.yaml
```

## Production Considerations

### Monitoring

Set up alerts for:
- HPA at maximum replicas (may need higher limit)
- HPA scaling events (abnormal patterns)
- Pods constantly scaling up/down (thrashing)

### Cost Optimization

Monitor your actual usage patterns and adjust:
- `minReplicas`: Lower if traffic is predictable
- `maxReplicas`: Increase if you hit limits during peak times
- Thresholds: Fine-tune based on actual performance needs

### Performance Tuning

If you experience issues:
1. **Scaling too slow**: Reduce stabilization windows
2. **Scaling too aggressive**: Increase stabilization windows
3. **Wrong metric**: Add custom metrics (request rate, queue depth, etc.)

## Testing from CI/CD

### GitHub Actions Example

```yaml
name: HPA Load Test
on:
  workflow_dispatch:
    inputs:
      service_url:
        description: 'Service URL to test'
        required: true
      test_type:
        description: 'Test type (standard/spike/quick)'
        default: 'quick'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
            sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Run k6 test
        run: |
          if [ "${{ github.event.inputs.test_type }}" == "spike" ]; then
            k6 run -e SERVICE_URL=${{ github.event.inputs.service_url }} \
              --out json=results.json scripts/hpa-spike-test.js
          else
            k6 run -e SERVICE_URL=${{ github.event.inputs.service_url }} \
              --out json=results.json scripts/hpa-load-test.js
          fi
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: results.json
```

### GitLab CI Example

```yaml
load-test:
  stage: test
  image: grafana/k6:latest
  script:
    - k6 run -e SERVICE_URL=$SERVICE_URL scripts/hpa-load-test.js
  artifacts:
    paths:
      - results.json
  only:
    - schedules
```

## Next Steps

After validating CPU/Memory HPA works:
1. **Run regular load tests** to validate HPA behavior
2. **Monitor in production** - set up alerts for scaling events
3. **Tune thresholds** based on actual traffic patterns
4. **Consider custom metrics** (request rate, queue depth)
5. **Document peak capacity** and cost implications
6. **Test failure scenarios** (pod crashes during high load)

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 Load Testing Guide](https://k6.io/docs/test-types/load-testing/)
- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [HPA Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server)
- [k6 Operator for Kubernetes](https://github.com/grafana/k6-operator)

