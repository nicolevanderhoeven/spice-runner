#!/bin/bash
# Deploy full observability stack in Kubernetes cluster

set -e

echo "☁️  Deploying Full Observability Stack to Kubernetes"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install it first."
    exit 1
fi

echo -e "${BLUE}📦 Step 1: Deploy Observability Stack (Prometheus, Loki, Tempo, Grafana)${NC}"
echo ""

# Create namespace
kubectl create namespace observability --dry-run=client -o yaml | kubectl apply -f -

# Deploy observability stack
kubectl apply -f k8s/observability-stack.yaml

echo -e "${GREEN}✓${NC} Observability stack deployed"
echo ""

echo -e "${BLUE}⏳ Waiting for observability services to be ready...${NC}"

# Wait for Prometheus
echo -n "  Prometheus..."
kubectl wait --for=condition=available --timeout=120s deployment/prometheus -n observability
echo -e " ${GREEN}✓${NC}"

# Wait for Loki
echo -n "  Loki..."
kubectl wait --for=condition=available --timeout=120s deployment/loki -n observability
echo -e " ${GREEN}✓${NC}"

# Wait for Tempo
echo -n "  Tempo..."
kubectl wait --for=condition=available --timeout=120s deployment/tempo -n observability
echo -e " ${GREEN}✓${NC}"

# Wait for Grafana
echo -n "  Grafana..."
kubectl wait --for=condition=available --timeout=120s deployment/grafana -n observability
echo -e " ${GREEN}✓${NC}"

echo ""
echo -e "${BLUE}📦 Step 2: Deploy Spice Runner Application${NC}"
echo ""

# Deploy application
kubectl apply -f k8s/deployment-cloud-stack.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

if kubectl get backendconfig &> /dev/null 2>&1; then
    kubectl apply -f k8s/backendconfig.yaml
fi

if kubectl get managedcertificate &> /dev/null 2>&1; then
    kubectl apply -f k8s/managed-certificate.yaml
fi

echo -e "${GREEN}✓${NC} Application deployed"
echo ""

echo -e "${BLUE}⏳ Waiting for application to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/spice-runner -n default

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""

# Get service info
GRAFANA_SERVICE=$(kubectl get service grafana -n observability -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
APP_INGRESS=$(kubectl get ingress spice-runner -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 Access Points:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$GRAFANA_SERVICE" != "pending" ]; then
    echo -e "  ${GREEN}Grafana${NC}     → http://$GRAFANA_SERVICE:3000"
else
    echo -e "  ${GREEN}Grafana${NC}     → Waiting for LoadBalancer IP..."
    echo "                 Run: kubectl port-forward -n observability service/grafana 3000:3000"
    echo "                 Then access: http://localhost:3000"
fi

echo ""

if [ "$APP_INGRESS" != "pending" ]; then
    echo -e "  ${GREEN}Game${NC}        → http://$APP_INGRESS/spice/"
else
    echo -e "  ${GREEN}Game${NC}        → Waiting for Ingress IP..."
    echo "                 Run: kubectl port-forward service/spice-runner 8080:80"
    echo "                 Then access: http://localhost:8080/spice/"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}📝 Useful Commands:${NC}"
echo ""
echo "  # Port-forward Grafana (if LoadBalancer pending)"
echo "  kubectl port-forward -n observability service/grafana 3000:3000"
echo ""
echo "  # Port-forward Game (if Ingress pending)"
echo "  kubectl port-forward service/spice-runner 8080:80"
echo ""
echo "  # View Grafana logs"
echo "  kubectl logs -n observability -l app=grafana"
echo ""
echo "  # View Alloy logs"
echo "  kubectl logs -l app=spice-runner -c alloy"
echo ""
echo "  # View Prometheus metrics"
echo "  kubectl port-forward -n observability service/prometheus 9090:9090"
echo "  # Then visit: http://localhost:9090"
echo ""
echo "  # Check pod status"
echo "  kubectl get pods -n observability"
echo "  kubectl get pods -n default -l app=spice-runner"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}🎉 Stack is deployed and ready!${NC}"
echo ""
echo "If LoadBalancers are pending, use port-forward commands above to access services."
echo ""

