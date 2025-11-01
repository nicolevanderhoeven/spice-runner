#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Kepler Energy Monitoring"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "✗ kubectl not found. Please install kubectl first."
    exit 1
fi

# Check cluster connectivity
echo -e "${BLUE}Checking cluster connectivity...${NC}"
if ! kubectl cluster-info &> /dev/null; then
    echo "✗ Cannot connect to Kubernetes cluster."
    exit 1
fi
echo -e "${GREEN}✓ Connected to cluster${NC}"
echo ""

# Deploy Kepler
echo -e "${BLUE}Deploying Kepler...${NC}"
kubectl apply -f k8s/kepler.yaml
echo -e "${GREEN}✓ Kepler manifests applied${NC}"
echo ""

# Update observability stack
echo -e "${BLUE}Updating Prometheus configuration...${NC}"
kubectl apply -f k8s/observability-stack.yaml
echo -e "${GREEN}✓ Prometheus configuration updated${NC}"
echo ""

# Deploy Kepler dashboard
echo -e "${BLUE}Deploying Kepler Grafana dashboard...${NC}"
kubectl apply -f k8s/kepler-dashboard.yaml
echo -e "${GREEN}✓ Kepler dashboard deployed${NC}"
echo ""

# Restart Prometheus to pick up new config
echo -e "${BLUE}Restarting Prometheus to load new configuration...${NC}"
kubectl rollout restart deployment/prometheus -n observability
kubectl rollout status deployment/prometheus -n observability --timeout=60s
echo -e "${GREEN}✓ Prometheus restarted${NC}"
echo ""

# Restart Grafana to pick up new dashboard
echo -e "${BLUE}Restarting Grafana to load new dashboard...${NC}"
kubectl rollout restart deployment/grafana -n observability
kubectl rollout status deployment/grafana -n observability --timeout=60s
echo -e "${GREEN}✓ Grafana restarted${NC}"
echo ""

# Wait for Kepler pods to be ready
echo -e "${BLUE}Waiting for Kepler pods to be ready...${NC}"
kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=kepler -n kepler --timeout=120s
echo -e "${GREEN}✓ Kepler pods ready${NC}"
echo ""

# Wait for model server
echo -e "${BLUE}Waiting for Kepler model server...${NC}"
kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=kepler-model-server -n kepler --timeout=120s
echo -e "${GREEN}✓ Model server ready${NC}"
echo ""

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""

# Get Grafana URL
GRAFANA_IP=$(kubectl get svc grafana -n observability -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo "Kepler Status:"
echo ""
kubectl get pods -n kepler
echo ""

echo "Next Steps:"
echo ""
echo "1. Access Grafana:"
if [ "$GRAFANA_IP" != "pending" ] && [ -n "$GRAFANA_IP" ]; then
    echo "   http://${GRAFANA_IP}:3000"
else
    echo "   Waiting for LoadBalancer IP..."
    echo "   Run: kubectl get svc grafana -n observability"
fi
echo ""
echo "2. Find the 'Kepler Energy & Power Consumption' dashboard"
echo "   - Look in the 'Energy' folder"
echo "   - Or search for 'kepler'"
echo ""
echo "3. View Kepler metrics directly:"
echo "   kubectl port-forward -n kepler svc/kepler 9102:9102"
echo "   curl http://localhost:9102/metrics"
echo ""
echo "4. Monitor Kepler logs:"
echo "   kubectl logs -n kepler -l app.kubernetes.io/name=kepler -f"
echo ""
echo -e "${YELLOW}Note: Kepler is using model-based estimation on GKE.${NC}"
echo -e "${YELLOW}Metrics are estimates based on resource utilization.${NC}"

