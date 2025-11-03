#!/bin/bash
# Simple wrapper to run light load test (50 sessions over 1 minute)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
NAMESPACE="${NAMESPACE:-default}"
SERVICE_URL="${SERVICE_URL:-}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Spice Runner Light Load Test${NC}"
echo -e "${BLUE}50 sessions over 1 minute${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   See https://k6.io/docs/get-started/installation/"
    echo "  Windows: choco install k6"
    exit 1
fi

# Get service URL if not provided
if [ -z "$SERVICE_URL" ]; then
    echo -e "${YELLOW}Detecting service URL...${NC}"
    
    # Try to get from ingress
    INGRESS_HOST=$(kubectl get ingress -n $NAMESPACE -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || echo "")
    
    if [ -n "$INGRESS_HOST" ]; then
        SERVICE_URL="https://$INGRESS_HOST"
        echo -e "${GREEN}Found ingress: $SERVICE_URL${NC}"
    else
        # Try LoadBalancer
        LB_IP=$(kubectl get svc spice-runner -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        
        if [ -n "$LB_IP" ]; then
            SERVICE_URL="http://$LB_IP"
            echo -e "${GREEN}Found LoadBalancer: $SERVICE_URL${NC}"
        else
            # Fallback to port-forward
            echo -e "${YELLOW}No external endpoint found. Setting up port-forward...${NC}"
            kubectl port-forward -n $NAMESPACE svc/spice-runner 8080:80 &
            PORT_FORWARD_PID=$!
            sleep 2
            SERVICE_URL="http://localhost:8080"
            echo -e "${GREEN}Port-forward active: $SERVICE_URL${NC}"
        fi
    fi
else
    echo -e "${GREEN}Using provided URL: $SERVICE_URL${NC}"
fi

echo ""

# Show current state
echo -e "${YELLOW}Current pods:${NC}"
kubectl get pods -n $NAMESPACE -l app=spice-runner
echo ""

# Run the light test
echo -e "${GREEN}Starting light load test (1 minute, 50 sessions)...${NC}"
echo ""

k6 run --out json=/tmp/k6-light-results.json -e SERVICE_URL="$SERVICE_URL" scripts/light-load-test.js

# Cleanup
if [ -n "$PORT_FORWARD_PID" ]; then
    kill $PORT_FORWARD_PID 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}✓ Light load test complete!${NC}"
echo ""

# Show final state
echo -e "${YELLOW}Final pod count:${NC}"
kubectl get pods -n $NAMESPACE -l app=spice-runner
echo ""

echo -e "${BLUE}Monitor scale-down with:${NC}"
echo "  watch kubectl get pods -n $NAMESPACE -l app=spice-runner"
echo ""

