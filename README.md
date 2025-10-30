# Spice Runner

The Spice Runner game is a Dune-themed browser game with full observability and advanced autoscaling capabilities. This project demonstrates production-grade Kubernetes deployment patterns with comprehensive monitoring and intelligent scaling.

![chrome offline game cast](img/chrome_offline_game.gif)

## Features

This project includes the following features:

- **Interactive Game**: Dune-themed endless runner browser game
- **Full Observability**: Metrics, logs, and traces with Grafana stack
- **KEDA Autoscaling**: Pod autoscaling based on HTTP traffic, CPU, and memory
- **GKE Cluster Autoscaler**: Automatic node provisioning based on pending pods
- **Real-time Monitoring**: Grafana Alloy, Prometheus, Loki, and Tempo

## Architecture

The application uses a multi-layer architecture with integrated observability and autoscaling:

```
User Traffic
    ↓
NGINX (with JSON logging)
    ↓
Grafana Alloy Sidecar (observability agent)
    ↓
├─→ Prometheus (metrics)
├─→ Loki (logs)
└─→ Tempo (traces)
    ↓
KEDA (scales pods based on metrics)
    ↓
GKE Cluster Autoscaler (provisions nodes for pending pods)
```

## Quick start

This guide helps you deploy the Spice Runner game to Google Kubernetes Engine (GKE) with full observability and autoscaling.

Before you begin, ensure you have the following:

- A GKE cluster running
- `kubectl` configured to access your cluster
- `gcloud` CLI installed and authenticated

### Deploy to GKE

To deploy the application to GKE, run the following commands:

```bash
# Configure your cluster
export CLUSTER_NAME="spice-runner-cluster"
export REGION="us-central1"
export GCP_PROJECT_ID=$(gcloud config get-value project)

# Deploy the observability stack
kubectl apply -f k8s/observability-stack.yaml

# Deploy the application
kubectl apply -f k8s/deployment-cloud-stack.yaml
kubectl apply -f k8s/service.yaml

# Apply KEDA autoscaling
kubectl apply -f k8s/keda-scaledobject.yaml

# Enable GKE Cluster Autoscaler
gcloud container clusters update $CLUSTER_NAME \
  --enable-autoscaling \
  --node-pool=default-pool \
  --min-nodes=1 \
  --max-nodes=10 \
  --zone=$ZONE
```

## Autoscaling

The application supports two levels of autoscaling to handle varying workloads efficiently.

### KEDA (Pod autoscaling)

KEDA provides horizontal pod autoscaling based on multiple metrics:

- **Min replicas**: 1
- **Max replicas**: 10 (can be increased)
- **Triggers**: HTTP request rate, CPU utilization, memory utilization

For setup details, refer to the [KEDA testing guide](docs/KEDA-TESTING.md).

### GKE Cluster Autoscaler (Node Autoscaling)

GKE Cluster Autoscaler provides production-ready node autoscaling:

- **Automatic node provisioning**: Adds nodes when pods cannot be scheduled
- **Node removal**: Removes underutilized nodes to save costs
- **Production-ready**: Fully supported by Google
- **Configuration**: Configured for min 1 node, max 10 nodes
- **Seamless integration**: Works automatically with KEDA pod autoscaling

## Testing

You can test the autoscaling behavior using automated load tests or manual scaling.

### Load testing

To run automated load tests, use the following commands:

```bash
# KEDA load tests
./scripts/run-hpa-test.sh
```

### Manual testing

To manually test scaling behavior, run the following commands:

```bash
# Scale up
kubectl scale deployment spice-runner --replicas=20

# Watch autoscaling
kubectl get pods -w
kubectl get nodes -w
```

## Documentation

The following documentation provides detailed guides for setup, configuration, and operations.

### Autoscaling

- [KEDA quickstart](docs/KEDA-QUICKSTART.md) - Quick KEDA setup
- [KEDA testing guide](docs/KEDA-TESTING.md) - KEDA testing procedures
- [HPA testing guide](docs/HPA-TESTING.md) - Horizontal Pod Autoscaler guide

### Monitoring and operations

- [Kubernetes monitoring setup](docs/K8S-MONITORING.md) - Kubernetes monitoring configuration
- [Kubernetes Dashboard guide](docs/KUBERNETES-DASHBOARD-GUIDE.md) - Dashboard usage
- [Grafana queries](docs/GRAFANA-QUERIES.md) - Useful Grafana queries
- [Demo guide](docs/DEMO-GUIDE.md) - Demo walkthrough

### Setup and configuration

- [Implementation summary](docs/IMPLEMENTATION-SUMMARY.md) - Implementation overview
- [Domain setup guide](docs/DOMAIN-SETUP.md) - Domain and ingress configuration
- [NVDH setup guide](docs/NVDH-SETUP.md) - NVDH configuration

## Project structure

The project is organized as follows:

```
spice-runner/
├── k8s/                           # Kubernetes manifests
│   ├── deployment-cloud-stack.yaml    # Main deployment
│   ├── service.yaml                   # Service definition
│   ├── keda-scaledobject.yaml        # KEDA autoscaling
│   └── observability-stack.yaml      # Grafana, Prometheus, Loki, Tempo
├── scripts/                       # Automation scripts
│   ├── install-keda.sh               # Install KEDA
│   └── run-hpa-test.sh              # Run KEDA tests
├── img/                           # Game graphics
├── index.html                     # Game frontend
├── nginx.conf                     # NGINX configuration
└── Dockerfile                     # Container image

```

## Monitoring URLs

After you deploy the application, you can access the following services:

- **Game**: `http://<YOUR_DOMAIN>/spice/`
- **Grafana**: Port-forward or expose via ingress
- **Prometheus**: `http://prometheus.observability.svc.cluster.local:9090`

## Cost optimization

You can optimize costs using different strategies depending on whether you use Karpenter.

### With Karpenter

Karpenter provides the following cost optimization capabilities:

- **Spot instances**: Up to 80% savings on compute costs
- **Node consolidation**: Removes underutilized nodes automatically
- **Right-sizing**: Provisions appropriately-sized nodes for workloads

### Without Karpenter

If you don't use Karpenter, consider these alternatives:

- Use GKE Cluster Autoscaler for basic node scaling
- Configure appropriate node pool sizes based on workload
- Set resource requests and limits carefully to optimize bin packing

## Troubleshooting

This section helps you diagnose and resolve common issues.

### Pods not scaling

To diagnose pod scaling issues, run the following commands:

```bash
# Check KEDA
kubectl get scaledobject
kubectl describe scaledobject spice-runner-keda

# Check metrics
kubectl get --raw /apis/external.metrics.k8s.io/v1beta1
```

### Nodes Not Scaling

If nodes aren't being added when pods are pending:

```bash
# Check cluster autoscaler status
kubectl get events --all-namespaces | grep -i autoscal

# Check node pool autoscaling configuration
gcloud container node-pools describe default-pool \
  --cluster=CLUSTER_NAME \
  --zone=ZONE
```

### High costs

If you experience unexpectedly high costs, take the following actions:

- Review instance types: Run `kubectl get nodes -o wide` to see active node types
- Check NodePool limits: Run `kubectl get nodepools -o yaml` to verify configuration
- Set up billing alerts in GCP Console to monitor spending

## Contributing

This is a demo project for showcasing autoscaling capabilities. You can contribute by:

- Testing different autoscaling configurations
- Adding new game features
- Improving observability dashboards
- Sharing findings from Karpenter testing

## License

See repository for license information.

---

**Built with**: Kubernetes, KEDA, GKE Cluster Autoscaler, Grafana Alloy, Prometheus, Loki, and Tempo.