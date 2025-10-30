#!/bin/bash
# Wrapper script to run k6 HPA tests with monitoring

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
NAMESPACE="${NAMESPACE:-default}"
HPA_NAME="spice-runner-hpa"
SERVICE_URL="${SERVICE_URL:-}"
TEST_TYPE="${1:-standard}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Spice Runner HPA Load Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo gpg -k"
    echo "           sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69"
    echo "           echo \"deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main\" | sudo tee /etc/apt/sources.list.d/k6.list"
    echo "           sudo apt-get update"
    echo "           sudo apt-get install k6"
    echo "  Windows: choco install k6"
    echo ""
    echo "Or download from: https://k6.io/docs/get-started/installation/"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Check HPA exists
echo -e "${GREEN}Checking HPA status...${NC}"
if ! kubectl get hpa $HPA_NAME -n $NAMESPACE &> /dev/null; then
    echo -e "${RED}Error: HPA '$HPA_NAME' not found in namespace '$NAMESPACE'${NC}"
    echo ""
    echo "Apply HPA first:"
    echo "  kubectl apply -f k8s/hpa.yaml"
    exit 1
fi

echo -e "${YELLOW}Current HPA status:${NC}"
kubectl get hpa $HPA_NAME -n $NAMESPACE
echo ""

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

# Show current pods
echo -e "${YELLOW}Current pods:${NC}"
kubectl get pods -n $NAMESPACE -l app=spice-runner
echo ""

# Start monitoring in background
echo -e "${GREEN}Starting HPA monitoring in background...${NC}"
(
    while true; do
        clear
        echo -e "${BLUE}=== Real-time HPA Monitoring ===${NC}"
        echo ""
        date
        echo ""
        
        echo -e "${YELLOW}HPA Status:${NC}"
        kubectl get hpa $HPA_NAME -n $NAMESPACE 2>/dev/null || echo "HPA not found"
        echo ""
        
        echo -e "${YELLOW}Running Pods:${NC}"
        kubectl get pods -n $NAMESPACE -l app=spice-runner --no-headers | wc -l | xargs echo "Pod count:"
        kubectl get pods -n $NAMESPACE -l app=spice-runner
        echo ""
        
        echo -e "${YELLOW}Resource Usage:${NC}"
        kubectl top pods -n $NAMESPACE -l app=spice-runner 2>/dev/null || echo "Metrics not available yet"
        echo ""
        
        echo -e "${YELLOW}Recent Events:${NC}"
        kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | grep -i "spice-runner\|hpa" | tail -5 || echo "No events"
        echo ""
        
        echo -e "${BLUE}Press Ctrl+C in the other terminal to stop load test${NC}"
        sleep 10
    done
) > /tmp/hpa-monitor.log 2>&1 &
MONITOR_PID=$!

# Give monitoring a moment to start
sleep 2

# Open monitoring in new terminal if possible
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "tail -f /tmp/hpa-monitor.log"' 2>/dev/null || echo "Could not open monitoring window"
elif command -v gnome-terminal &> /dev/null; then
    # Linux with GNOME
    gnome-terminal -- bash -c "tail -f /tmp/hpa-monitor.log; exec bash" 2>/dev/null || echo "Could not open monitoring window"
fi

echo ""
echo -e "${GREEN}Starting k6 load test...${NC}"
echo ""

# Select and run test
case "$TEST_TYPE" in
    standard|"")
        echo -e "${BLUE}Running standard HPA load test (15 minutes)${NC}"
        k6 run --out json=/tmp/k6-results.json -e SERVICE_URL="$SERVICE_URL" scripts/hpa-load-test.js
        ;;
    spike)
        echo -e "${BLUE}Running spike test (5 minutes)${NC}"
        k6 run --out json=/tmp/k6-results.json -e SERVICE_URL="$SERVICE_URL" scripts/hpa-spike-test.js
        ;;
    quick)
        echo -e "${BLUE}Running quick test (3 minutes)${NC}"
        k6 run --duration 3m --vus 50 --out json=/tmp/k6-results.json -e SERVICE_URL="$SERVICE_URL" scripts/hpa-load-test.js
        ;;
    *)
        echo -e "${RED}Unknown test type: $TEST_TYPE${NC}"
        echo "Usage: $0 [standard|spike|quick]"
        kill $MONITOR_PID 2>/dev/null || true
        exit 1
        ;;
esac

# Cleanup
echo ""
echo -e "${GREEN}Load test complete!${NC}"
echo ""
echo -e "${YELLOW}Cleaning up...${NC}"
kill $MONITOR_PID 2>/dev/null || true

if [ -n "$PORT_FORWARD_PID" ]; then
    kill $PORT_FORWARD_PID 2>/dev/null || true
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Show final state
echo -e "${YELLOW}Final HPA status:${NC}"
kubectl get hpa $HPA_NAME -n $NAMESPACE
echo ""

echo -e "${YELLOW}Final pod count:${NC}"
kubectl get pods -n $NAMESPACE -l app=spice-runner
echo ""

echo -e "${YELLOW}HPA Events:${NC}"
kubectl describe hpa $HPA_NAME -n $NAMESPACE | grep -A 20 "Events:" || echo "No events"
echo ""

echo -e "${GREEN}Next steps:${NC}"
echo "1. Monitor scale-down (takes ~5 minutes):"
echo "   watch kubectl get pods -n $NAMESPACE -l app=spice-runner"
echo ""
echo "2. View detailed results:"
echo "   cat /tmp/k6-results.json | jq ."
echo ""
echo "3. Check Grafana dashboard:"
echo "   kubectl get svc grafana -n observability"
echo ""

