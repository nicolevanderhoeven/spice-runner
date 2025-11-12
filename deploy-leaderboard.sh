#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🏆 Spice Runner Leaderboard Deployment${NC}"
echo "========================================"
echo ""

# Check if GCP project ID is provided
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  GCP_PROJECT_ID environment variable not set${NC}"
    echo "Please set it with: export GCP_PROJECT_ID=your-project-id"
    echo "Or provide it as first argument: ./deploy-leaderboard.sh your-project-id"
    if [ ! -z "$1" ]; then
        export GCP_PROJECT_ID=$1
        echo -e "${GREEN}✓ Using project ID from argument: $GCP_PROJECT_ID${NC}"
    else
        exit 1
    fi
fi

echo -e "${GREEN}📦 Project ID: $GCP_PROJECT_ID${NC}"
echo ""

# Step 1: Build Go application
echo -e "${YELLOW}→ Building Go application...${NC}"
cd leaderboard-api
if [ ! -f "go.mod" ]; then
    echo -e "${RED}✗ go.mod not found. Are you in the right directory?${NC}"
    exit 1
fi

go mod download
go build -o leaderboard-api .
echo -e "${GREEN}✓ Go application built${NC}"
echo ""

# Step 2: Build Docker image
echo -e "${YELLOW}→ Building Docker image for linux/amd64...${NC}"
docker build --platform linux/amd64 -t gcr.io/$GCP_PROJECT_ID/spice-runner-leaderboard:latest .
echo -e "${GREEN}✓ Docker image built${NC}"
echo ""

# Step 3: Push to GCR
echo -e "${YELLOW}→ Pushing to Google Container Registry...${NC}"
docker push gcr.io/$GCP_PROJECT_ID/spice-runner-leaderboard:latest
echo -e "${GREEN}✓ Image pushed to GCR${NC}"
echo ""

cd ..

# Step 4: Update Kubernetes manifests
echo -e "${YELLOW}→ Updating Kubernetes manifests with project ID...${NC}"
sed -i.bak "s|gcr.io/YOUR_PROJECT_ID|gcr.io/$GCP_PROJECT_ID|g" k8s/leaderboard-api.yaml
rm k8s/leaderboard-api.yaml.bak 2>/dev/null || true
echo -e "${GREEN}✓ Manifests updated${NC}"
echo ""

# Step 5: Deploy PostgreSQL
echo -e "${YELLOW}→ Deploying PostgreSQL...${NC}"
kubectl apply -f k8s/leaderboard-postgres.yaml
echo "  Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s || {
    echo -e "${RED}✗ PostgreSQL failed to start. Check logs with: kubectl logs -l app=postgres${NC}"
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL deployed and ready${NC}"
echo ""

# Step 6: Deploy Redis
echo -e "${YELLOW}→ Deploying Redis...${NC}"
kubectl apply -f k8s/leaderboard-redis.yaml
echo "  Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis --timeout=60s || {
    echo -e "${RED}✗ Redis failed to start. Check logs with: kubectl logs -l app=redis${NC}"
    exit 1
}
echo -e "${GREEN}✓ Redis deployed and ready${NC}"
echo ""

# Step 7: Deploy API
echo -e "${YELLOW}→ Deploying Leaderboard API...${NC}"
kubectl apply -f k8s/leaderboard-api.yaml
echo "  Waiting for API to be ready..."
kubectl wait --for=condition=ready pod -l app=leaderboard-api --timeout=300s || {
    echo -e "${RED}✗ API failed to start. Check logs with: kubectl logs -l app=leaderboard-api${NC}"
    exit 1
}
echo -e "${GREEN}✓ Leaderboard API deployed and ready${NC}"
echo ""

# Step 8: Verify deployment
echo -e "${YELLOW}→ Verifying deployment...${NC}"
echo ""
echo "Pods:"
kubectl get pods -l component=leaderboard
echo ""
echo "Services:"
kubectl get svc -l component=leaderboard
echo ""

# Test health endpoint
echo -e "${YELLOW}→ Testing API health endpoint...${NC}"
API_POD=$(kubectl get pod -l app=leaderboard-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec $API_POD -- wget -qO- http://localhost:8080/health || {
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
}
echo ""
echo -e "${GREEN}✓ API health check passed${NC}"
echo ""

# Step 9: Deploy Grafana dashboard
echo -e "${YELLOW}→ Deploying Grafana dashboard...${NC}"
kubectl apply -f k8s/leaderboard-dashboard.yaml
echo ""

echo -e "${YELLOW}→ Updating observability stack...${NC}"
kubectl apply -f k8s/observability-stack.yaml
echo ""

echo -e "${YELLOW}→ Restarting Grafana to load dashboard...${NC}"
kubectl rollout restart deployment/grafana -n observability
kubectl rollout status deployment/grafana -n observability --timeout=120s
echo ""

echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}📊 Next steps:${NC}"
echo ""
echo "1. View Grafana dashboard:"
echo "   - Open Grafana (get IP: kubectl get svc grafana -n observability)"
echo "   - Navigate to Dashboards → Leaderboard folder"
echo "   - Open: 'Spice Runner - Leaderboard Observability'"
echo ""
echo "2. Test the API:"
echo "   kubectl port-forward svc/leaderboard-api 8080:80"
echo "   curl http://localhost:8080/health"
echo ""
echo "3. Submit a test score:"
echo "   curl -X POST http://localhost:8080/api/scores \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"playerName\":\"Test\",\"score\":1234,\"sessionId\":\"test-1\"}'"
echo ""
echo "4. View leaderboard:"
echo "   curl http://localhost:8080/api/leaderboard/top?limit=10"
echo ""
echo "   (Or via public endpoint: https://YOUR_DOMAIN/spice/leaderboard/api/health)"
echo ""
echo "5. Frontend integration:"
echo "   - The frontend already includes leaderboard support"
echo "   - Scores are automatically submitted on game over"
echo "   - Player names are captured for scores above 1000"
echo ""
echo -e "${YELLOW}📚 Documentation:${NC}"
echo "   See docs/LEADERBOARD-SYSTEM.md for detailed information"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

