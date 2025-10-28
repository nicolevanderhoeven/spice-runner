#!/bin/bash
# Demo Health Check Script
# Run this before your demo to ensure everything is working

echo "🔍 Checking Observability Stack Health..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

checks_passed=0
checks_failed=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $1"
        ((checks_failed++))
    fi
}

# Check 1: Game pod running
echo -n "Checking game pod... "
kubectl get pods -l app=spice-runner -o jsonpath='{.items[0].status.phase}' | grep -q "Running"
check "Game pod is running"

# Check 2: Both containers ready
echo -n "Checking containers... "
kubectl get pods -l app=spice-runner -o jsonpath='{.items[0].status.containerStatuses[*].ready}' | grep -q "true true"
check "Both containers (nginx + alloy) are ready"

# Check 3: Observability stack pods
echo -n "Checking Grafana... "
kubectl get pods -n observability -l app=grafana -o jsonpath='{.items[0].status.phase}' | grep -q "Running"
check "Grafana is running"

echo -n "Checking Prometheus... "
kubectl get pods -n observability -l app=prometheus -o jsonpath='{.items[0].status.phase}' | grep -q "Running"
check "Prometheus is running"

echo -n "Checking Loki... "
kubectl get pods -n observability -l app=loki -o jsonpath='{.items[0].status.phase}' | grep -q "Running"
check "Loki is running"

echo -n "Checking Tempo... "
kubectl get pods -n observability -l app=tempo -o jsonpath='{.items[0].status.phase}' | grep -q "Running"
check "Tempo is running"

# Check 4: Ingress configured
echo -n "Checking ingress... "
kubectl get ingress spice-runner-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' | grep -q "34"
check "Ingress has external IP"

# Check 5: Game is accessible
echo -n "Checking game URL... "
curl -s -o /dev/null -w "%{http_code}" https://nvdh.dev/spice/ | grep -q "200"
check "Game is accessible at https://nvdh.dev/spice/"

# Check 6: Alloy is collecting logs
echo -n "Checking Alloy logs... "
kubectl logs -l app=spice-runner -c alloy --tail=50 | grep -q "loki.write.default"
check "Alloy is configured to send logs to Loki"

# Check 7: Generate test traffic and verify
echo ""
echo "📊 Generating test traffic..."
for i in {1..5}; do
    curl -s https://nvdh.dev/spice/ > /dev/null
    echo -n "."
done
echo " done!"

sleep 2

# Check if logs are arriving
echo -n "Checking if logs are flowing... "
kubectl logs -l app=spice-runner -c spice-runner --tail=10 | grep -q "GET /spice"
check "Nginx is logging requests"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Summary: ${GREEN}${checks_passed} passed${NC}, ${RED}${checks_failed} failed${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $checks_failed -eq 0 ]; then
    echo -e "${GREEN}🎉 All systems go! Ready for demo!${NC}"
    echo ""
    echo "📋 Quick Reference:"
    echo "   Game:     https://nvdh.dev/spice/"
    echo "   Grafana:  http://34.60.65.9:3000 (admin/admin)"
    echo ""
    echo "Next: Open DEMO-GUIDE.md for demo script"
else
    echo -e "${YELLOW}⚠️  Some checks failed. Review errors above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "  • Wait 30s for pods to stabilize"
    echo "  • Check: kubectl get pods --all-namespaces"
    echo "  • Restart Alloy: kubectl rollout restart deployment/spice-runner"
fi

echo ""

