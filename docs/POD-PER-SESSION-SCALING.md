# Pod-Per-Session Scaling (1:1 Scaling)

## Overview

This document explains the implementation of **1:1 pod-per-session scaling** for the Spice Runner application. In this configuration, KEDA attempts to maintain approximately **1 pod for every active game session**, creating a dramatic demonstration of Kubernetes autoscaling capabilities.

> ⚠️ **Note**: This is configured for **demo purposes**. For a static frontend like Spice Runner, 1:1 scaling is not cost-efficient. In production, one pod can easily serve hundreds of concurrent sessions. However, this configuration showcases Kubernetes' scaling capabilities effectively.

## How It Works

### Architecture

```
┌─────────────┐
│   Player    │ Opens game in browser
│   Browser   │
└──────┬──────┘
       │
       ├─ Sends heartbeat events every 5 seconds
       ├─ Generates ~0.5-1 HTTP req/s while playing
       │
       v
┌─────────────────────────────────────────────────────┐
│              Alloy Sidecar (in Pod)                 │
│  • Receives Faro events (game_session_heartbeat)    │
│  • Logs to Loki                                     │
│  • Exposes nginx metrics to Prometheus              │
└─────────────────────────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────────────────┐
│              Prometheus                             │
│  • Scrapes nginx_http_requests_total metric         │
│  • Exposes query API for KEDA                       │
└─────────────────────────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────────────────┐
│              KEDA                                   │
│  • Queries Prometheus every 5 seconds              │
│  • Calculates: pods = HTTP_req/s / 1               │
│  • Updates HPA to scale deployment                  │
└─────────────────────────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────────────────┐
│           Horizontal Pod Autoscaler                 │
│  • Scales spice-runner deployment                   │
│  • Range: 0-200 pods                                │
└─────────────────────────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────────────────┐
│              Karpenter (Node Autoscaler)            │
│  • Adds nodes when pods are pending                 │
│  • Removes nodes when utilization is low            │
└─────────────────────────────────────────────────────┘
```

### Component Details

#### 1. Frontend Heartbeat System

**File**: `scripts/otel-metrics.js`

- Sends `game_session_heartbeat` event every 5 seconds via Faro
- Events include:
  - `sessionId`: Unique game session identifier
  - `timestamp`: Event timestamp
  - `status`: `active` or `inactive`
  - `idleTime`: Milliseconds since last activity
  - `sessionDuration`: Total session time
- Automatically starts when game begins
- Automatically stops when game ends

**Session Timeout Protection**:
- **Idle timeout**: 5 minutes without any player interaction
- **Maximum session**: 30 minutes absolute limit (prevents infinite sessions)
- **Activity tracking**: Monitors keypresses, mouse clicks, touches
- **Tab close detection**: Cleans up session when browser tab closes
- **Visibility API**: Updates activity when tab regains focus

**Lifecycle**:
```javascript
// Game starts → heartbeat begins
game.start() → gameMetrics.setActive() → heartbeat every 5s

// Player active → idle timer resets
player.keypress() → gameMetrics.updateActivity() → timer resets

// Player idle 5min → session times out
no activity for 5min → heartbeat detects timeout → setInactive()

// Maximum duration reached → session times out
30min elapsed → heartbeat detects max duration → setInactive()

// Game ends → heartbeat stops
game.over() → gameMetrics.setInactive() → heartbeat stops

// Tab closes → session cleaned up
window.close() → beforeunload → setInactive() via sendBeacon

// Game restarts → heartbeat resumes
game.restart() → gameMetrics.setActive() → heartbeat resumes
```

#### 2. KEDA Configuration

**File**: `k8s/keda-scaledobject.yaml`

**Key Settings**:
```yaml
spec:
  minReplicaCount: 0              # Scale to zero when no activity
  maxReplicaCount: 200            # Support up to 200 concurrent sessions
  pollingInterval: 5              # Check metrics every 5 seconds
  cooldownPeriod: 30              # Scale down after 30 seconds of low activity
  
  triggers:
  - type: prometheus
    metadata:
      # Scaling formula: pods = HTTP_req/s / threshold
      # 1 req/s = 1 pod (approximately 1 active session)
      query: sum(rate(nginx_http_requests_total[30s]))
      threshold: '1'              # 1 pod per 1 req/s
      activationThreshold: '0.2'  # Wake from zero at any activity
```

**Scaling Math**:
- Each active game session generates ~0.5-1 req/s (heartbeats + game events)
- KEDA calculates: `desired_pods = current_req_per_sec / threshold`
- Examples:
  - 1 active session (1 req/s) → 1 pod
  - 5 active sessions (5 req/s) → 5 pods
  - 50 active sessions (50 req/s) → 50 pods
  - 0 active sessions (0 req/s) → 0 pods (scale to zero)

#### 3. Prometheus Metrics

**Metric**: `nginx_http_requests_total`
- Type: Counter
- Labels: `service="spice-runner-nginx"`
- Source: nginx-prometheus-exporter sidecar
- Scrape interval: 10 seconds

**Query Used by KEDA**:
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[30s])) or vector(0)
```

This calculates the per-second rate of HTTP requests over a 30-second window.

## Deployment

### Prerequisites

1. **KEDA installed** in the cluster:
   ```bash
   kubectl get pods -n keda
   ```

2. **Prometheus running** and scraping nginx metrics:
   ```bash
   kubectl get pods -n observability -l app=prometheus
   ```

3. **Nginx exporter sidecar** in spice-runner pods

### Apply Configuration

```bash
# 1. Deploy the updated frontend with heartbeat tracking
kubectl apply -f k8s/deployment-cloud-stack.yaml

# 2. Apply the 1:1 scaling KEDA configuration
kubectl apply -f k8s/keda-scaledobject.yaml

# 3. Verify KEDA ScaledObject is created
kubectl get scaledobject spice-runner-keda -n default

# Expected output:
# NAME                  SCALETARGETKIND      SCALETARGETNAME   MIN   MAX   TRIGGERS     AUTHENTICATION   READY   ACTIVE
# spice-runner-keda     apps/v1.Deployment   spice-runner      0     200   prometheus   N/A              True    False
```

### Verify Setup

```bash
# 1. Check that pods start at 0 or scale down to 0
kubectl get pods -l app=spice-runner -n default

# 2. Open the game in a browser
open https://nvdh.dev/spice/

# 3. Start playing and watch pods scale up
watch kubectl get pods -l app=spice-runner -n default

# 4. Check KEDA metrics
kubectl get hpa -n default

# 5. View scaling events
kubectl describe scaledobject spice-runner-keda -n default
```

## Monitoring

### Key Metrics

#### Active Sessions (Approximation)
```promql
# Current HTTP request rate (proxy for active sessions)
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

#### Pods vs Sessions
```promql
# Compare pod count to request rate
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m])) 
/ 
count(kube_pod_status_phase{pod=~"spice-runner-.*", phase="Running"})
```

Should be close to 1.0 (1 req/s per pod = 1 session per pod)

#### Scaling Activity
```bash
# View HPA status
kubectl get hpa -n default -w

# View KEDA metrics in real-time
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator -f | grep spice-runner
```

### Grafana Dashboard Queries

Add these panels to your Grafana dashboard:

**Panel 1: Active Sessions (Approximate)**
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
```

**Panel 2: Pod Count**
```promql
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Panel 3: Sessions Per Pod**
```promql
sum(rate(nginx_http_requests_total{service="spice-runner-nginx"}[1m]))
/
count(kube_pod_status_phase{pod=~"spice-runner-.*", namespace="default", phase="Running"})
```

**Panel 4: Node Count**
```promql
count(kube_node_info)
```

## Testing

### Test 1: Single Session

```bash
# 1. Ensure cluster is at zero
kubectl get pods -l app=spice-runner -n default
# Should show: No resources found

# 2. Open game in browser
open https://nvdh.dev/spice/

# 3. Press space to start game

# 4. Watch pods scale up (should see 1 pod)
watch kubectl get pods -l app=spice-runner -n default

# 5. Stop playing and wait 30 seconds

# 6. Pod should scale back to zero
```

**Expected Timeline**:
- t=0s: Start game
- t=5s: First heartbeat sent
- t=10s: KEDA detects activity
- t=15s: Pod starts provisioning
- t=30s: Pod is ready and serving
- t=60s: Stop playing
- t=90s: Cooldown period ends
- t=100s: Pod terminates, scale to zero

### Test 2: Multiple Sessions

```bash
# Open game in 10 browser tabs simultaneously
for i in {1..10}; do
  open https://nvdh.dev/spice/
done

# Watch pod count increase to ~10
watch kubectl get pods -l app=spice-runner -n default

# Watch node count increase if needed
watch kubectl get nodes
```

**Expected Result**:
- 10 active sessions → ~10-12 pods
- If nodes are at capacity → Karpenter adds nodes
- Each session generates ~1 req/s → 10 req/s total → 10 pods

### Test 3: Load Test

```bash
# Simulate 50 concurrent sessions with k6
cd scripts
k6 run -e SERVICE_URL=https://nvdh.dev --vus 50 --duration 5m hpa-load-test.js

# Monitor scaling
watch "kubectl get pods -l app=spice-runner | wc -l && echo '---' && kubectl get nodes | wc -l"
```

**Expected Result**:
- 50 VUs → ~50-60 pods
- Nodes scale from 2-3 → 8-10 nodes
- Demonstrates massive cluster growth

## Troubleshooting

### Pods Not Scaling

**Symptom**: Playing game but pods stay at 0

**Checks**:
```bash
# 1. Verify KEDA is running
kubectl get pods -n keda

# 2. Check ScaledObject status
kubectl describe scaledobject spice-runner-keda -n default

# 3. Check if metrics are available
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1/namespaces/default/http_requests_per_second"

# 4. Check Prometheus has nginx metrics
kubectl port-forward -n observability svc/prometheus 9090:9090
# Open http://localhost:9090 and query: nginx_http_requests_total
```

**Common Issues**:
- KEDA not installed: `helm install keda kedacore/keda --namespace keda --create-namespace`
- Prometheus not scraping: Check Alloy sidecar logs
- ScaledObject error: `kubectl logs -n keda -l app.kubernetes.io/name=keda-operator`

### Scaling Too Slowly

**Symptom**: Delay between starting game and pod appearing

**Solutions**:
```yaml
# Reduce polling interval (current: 5s)
spec:
  pollingInterval: 3  # Check every 3 seconds

# Reduce activation threshold (current: 0.2)
triggers:
- metadata:
    activationThreshold: '0.1'  # More sensitive
```

### Scaling Too Aggressively

**Symptom**: More pods than active sessions

**Adjust threshold**:
```yaml
triggers:
- metadata:
    threshold: '2'  # Now requires 2 req/s per pod
```

### Not Scaling to Zero

**Symptom**: Pods remain after closing all games

**Checks**:
```bash
# 1. Verify minReplicaCount is 0
kubectl get scaledobject spice-runner-keda -n default -o yaml | grep minReplicaCount

# 2. Check if there's still traffic (abandoned sessions)
kubectl logs -l app=spice-runner -n default -c alloy | grep heartbeat | tail -20

# 3. Wait for session timeout (5 minutes idle or 30 minutes max)
# Sessions will automatically timeout and stop sending heartbeats

# 4. Check KEDA logs
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator | grep "Scaling to zero"
```

**Common Causes**:
- Abandoned game sessions (will timeout after 5 minutes idle)
- Browser tabs left open (will timeout after 30 minutes max)
- Background load tests running

**Note**: With the session timeout feature, pods will always scale down within 35 minutes maximum (30min max session + 5min cooldown), even if tabs are never closed.

## Production Considerations

### Why This Isn't Production-Ready

1. **Cost Inefficiency**: Static frontends can serve 1000+ concurrent users per pod
2. **Scaling Overhead**: Pod startup time (10-30s) causes poor UX
3. **Resource Waste**: Each pod consumes CPU/memory regardless of load
4. **Complexity**: More moving parts = more failure modes

### When 1:1 Scaling DOES Make Sense

This pattern is actually used in production for:

- **Game Servers**: Dedicated Minecraft/CS:GO servers per match
- **Jupyter Notebooks**: One pod per user notebook
- **VSCode Remote**: One pod per remote dev environment
- **WebSocket Services**: Stateful connection per pod
- **GPU Workloads**: One pod per AI inference session
- **Build Agents**: One pod per CI/CD job

**Framework**: Agones (Kubernetes for game servers) implements this pattern

### Production Alternative

For a static frontend like this, use traditional HPA:

```yaml
spec:
  minReplicaCount: 2      # High availability
  maxReplicaCount: 10     # Cost protection
  triggers:
  - type: prometheus
    metadata:
      threshold: '100'    # 100 req/s per pod (much more efficient)
```

With this configuration:
- 1 pod serves ~100 concurrent sessions
- Cost: $10/month instead of $1000/month
- Same performance, better reliability

## Cost Analysis

### 1:1 Scaling Costs

Assumptions:
- 50 concurrent sessions average
- GKE e2-medium nodes ($24/month)
- 25 pods per node

**Monthly Cost**:
- 50 sessions × 1 pod/session = 50 pods
- 50 pods / 25 pods per node = 2 nodes
- 2 nodes × $24 = **$48/month**

### Efficient Scaling Costs

With threshold of 100 req/s:
- 50 sessions × 1 req/s = 50 req/s
- 50 req/s / 100 threshold = 0.5 pods → 2 pods (minReplicas)
- 2 pods = 1 node
- **$24/month**

**Savings: 50%** 💰

## Demo Script

Use this script when demonstrating to an audience:

### Setup (Before Demo)

```bash
# Scale to zero
kubectl scale deployment spice-runner --replicas=0 -n default

# Verify zero state
kubectl get pods -l app=spice-runner -n default
# Should show: No resources found

# Open monitoring dashboard
kubectl port-forward -n observability svc/grafana 3000:3000 &
open http://localhost:3000
# Navigate to "Spice Runner - Observability Stack" dashboard
```

### Demo Flow

**1. Introduce the Application** (1 min)
> "This is Spice Runner, a simple browser game. It's a static frontend - normally one pod could handle thousands of players. But today, we're going to do something unusual..."

**2. Explain 1:1 Scaling** (1 min)
> "We've configured Kubernetes to spin up 1 pod for EVERY active game session. This isn't efficient, but it demonstrates Kubernetes' autoscaling power beautifully."

**3. Show Current State** (30s)
```bash
kubectl get pods -l app=spice-runner -n default
kubectl get nodes
```
> "Right now: zero pods, zero load. Let's change that."

**4. Start Playing** (30s)
> "I'm opening the game and starting to play..."
[Open browser, press space to start game]

**5. Watch Scaling** (2 min)
```bash
watch kubectl get pods -l app=spice-runner -n default
```
> "Within seconds, Kubernetes detects the active session and spins up a pod. The game sends heartbeat events, KEDA picks them up, and creates a pod."

**6. Multiple Sessions** (2 min)
> "Now let's have the audience join..."
[Share URL with audience]
```bash
watch "kubectl get pods -l app=spice-runner -n default | wc -l"
```
> "Watch as each person who starts playing gets their own pod!"

**7. Show Grafana** (1 min)
> "In Grafana, we can see the correlation between active sessions and pod count. Notice how they track almost 1:1."

**8. Scale Down** (1 min)
> "Now everyone stop playing... and watch what happens."
```bash
watch kubectl get pods -l app=spice-runner -n default
```
> "After 30 seconds of inactivity, Kubernetes automatically scales back to zero. No wasted resources!"

### Talking Points

- **Kubernetes Flexibility**: "This shows Kubernetes can scale from zero to hundreds of pods automatically"
- **Observability Integration**: "KEDA is making scaling decisions based on real application metrics, not just CPU"
- **Right-Sizing**: "In production, we'd tune this for efficiency, but this demonstrates the platform's capabilities"
- **Cloud Native**: "This is fully automated - no manual intervention, no cron jobs, no scripts"

## Summary

The 1:1 pod-per-session configuration successfully demonstrates:

✅ **Scale-to-Zero**: Cluster can scale down to 0 pods when idle
✅ **Rapid Scale-Up**: New pods provision within seconds of activity
✅ **Application-Aware**: Scaling based on actual game sessions, not just CPU
✅ **Observability-Driven**: Uses Prometheus metrics from real user monitoring
✅ **Node Autoscaling**: Karpenter adds nodes as pod count grows
✅ **Automated Management**: Fully hands-off operation

This configuration is perfect for:
- 🎭 **Demos and presentations**
- 🧪 **Testing autoscaling infrastructure**
- 📚 **Learning Kubernetes/KEDA concepts**
- 🎯 **Showcasing platform capabilities**

For production workloads, adjust thresholds to balance cost and performance based on your application's actual resource usage.

---

**Related Documentation**:
- [KEDA Setup](./KEDA-QUICKSTART.md)
- [HPA Testing Guide](./HPA-TESTING.md)
- [Karpenter Configuration](./KARPENTER-SETUP.md)

