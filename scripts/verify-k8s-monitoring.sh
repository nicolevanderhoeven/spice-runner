#!/bin/bash
set -e

# Kubernetes Monitoring Stack Verification Script
# This script verifies that all components of the K8s monitoring stack are deployed and working

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Kubernetes Monitoring Stack Verification"
echo "========================================"
echo ""

# Function to check if a deployment is ready
check_deployment() {
    local namespace=$1
    local deployment=$2
    
    echo -n "Checking deployment ${deployment} in namespace ${namespace}... "
    
    if kubectl get deployment -n ${namespace} ${deployment} &> /dev/null; then
        ready=$(kubectl get deployment -n ${namespace} ${deployment} -o jsonpath='{.status.readyReplicas}')
        desired=$(kubectl get deployment -n ${namespace} ${deployment} -o jsonpath='{.spec.replicas}')
        
        if [ "${ready}" == "${desired}" ] && [ "${ready}" != "" ]; then
            echo -e "${GREEN}✓ Ready (${ready}/${desired})${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Not ready (${ready:-0}/${desired})${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ Not found${NC}"
        return 1
    fi
}

# Function to check if a service exists
check_service() {
    local namespace=$1
    local service=$2
    
    echo -n "Checking service ${service} in namespace ${namespace}... "
    
    if kubectl get svc -n ${namespace} ${service} &> /dev/null; then
        echo -e "${GREEN}✓ Exists${NC}"
        return 0
    else
        echo -e "${RED}✗ Not found${NC}"
        return 1
    fi
}

# Function to check Prometheus targets
check_prometheus_targets() {
    echo ""
    echo "Checking Prometheus scrape targets..."
    
    # Port forward to Prometheus (in background)
    kubectl port-forward -n observability svc/prometheus 9090:9090 &> /dev/null &
    PORT_FORWARD_PID=$!
    
    # Wait for port forward to be ready
    sleep 3
    
    # Query Prometheus targets
    targets=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null || echo "error")
    
    # Kill port forward
    kill $PORT_FORWARD_PID 2>/dev/null || true
    
    if [ "$targets" == "error" ]; then
        echo -e "${RED}✗ Could not connect to Prometheus${NC}"
        return 1
    fi
    
    # Check for specific targets
    if echo "$targets" | grep -q "kube-state-metrics"; then
        echo -e "${GREEN}✓ kube-state-metrics target found${NC}"
    else
        echo -e "${YELLOW}⚠ kube-state-metrics target not found${NC}"
    fi
    
    if echo "$targets" | grep -q "kubernetes-nodes"; then
        echo -e "${GREEN}✓ kubernetes-nodes target found${NC}"
    else
        echo -e "${YELLOW}⚠ kubernetes-nodes target not found${NC}"
    fi
    
    if echo "$targets" | grep -q "kubernetes-pods"; then
        echo -e "${GREEN}✓ kubernetes-pods target found${NC}"
    else
        echo -e "${YELLOW}⚠ kubernetes-pods target not found (may be normal if no annotated pods)${NC}"
    fi
}

# Function to check if dashboard exists in Grafana
check_grafana_dashboard() {
    echo ""
    echo "Checking Grafana dashboards..."
    
    # Port forward to Grafana (in background)
    kubectl port-forward -n observability svc/grafana 3000:3000 &> /dev/null &
    PORT_FORWARD_PID=$!
    
    # Wait for port forward to be ready
    sleep 3
    
    # Query Grafana dashboards (using anonymous access)
    dashboards=$(curl -s http://localhost:3000/api/search 2>/dev/null || echo "error")
    
    # Kill port forward
    kill $PORT_FORWARD_PID 2>/dev/null || true
    
    if [ "$dashboards" == "error" ]; then
        echo -e "${RED}✗ Could not connect to Grafana${NC}"
        return 1
    fi
    
    # Check for Kubernetes dashboard
    if echo "$dashboards" | grep -q "kubernetes-cluster-monitoring"; then
        echo -e "${GREEN}✓ Kubernetes Cluster Monitoring dashboard found${NC}"
    else
        echo -e "${YELLOW}⚠ Kubernetes Cluster Monitoring dashboard not found${NC}"
    fi
    
    if echo "$dashboards" | grep -q "spice-runner-observability"; then
        echo -e "${GREEN}✓ Spice Runner dashboard found${NC}"
    else
        echo -e "${YELLOW}⚠ Spice Runner dashboard not found${NC}"
    fi
}

# Function to test metrics availability
check_metrics() {
    echo ""
    echo "Checking if kube-state-metrics is exposing metrics..."
    
    # Try to get metrics from kube-state-metrics
    if kubectl exec -n observability deployment/prometheus -- wget -q -O- http://kube-state-metrics.kube-system.svc.cluster.local:8080/metrics | head -n 5 &> /dev/null; then
        echo -e "${GREEN}✓ Metrics available from kube-state-metrics${NC}"
        
        # Show sample metrics
        echo ""
        echo "Sample metrics from kube-state-metrics:"
        kubectl exec -n observability deployment/prometheus -- wget -q -O- http://kube-state-metrics.kube-system.svc.cluster.local:8080/metrics | grep "kube_node_info\|kube_pod_info" | head -n 3
    else
        echo -e "${RED}✗ Could not retrieve metrics from kube-state-metrics${NC}"
        return 1
    fi
}

echo "1. Checking Observability Stack Components"
echo "-------------------------------------------"

# Check observability namespace
check_deployment "observability" "prometheus"
check_deployment "observability" "loki"
check_deployment "observability" "tempo"
check_deployment "observability" "grafana"

check_service "observability" "prometheus"
check_service "observability" "loki"
check_service "observability" "tempo"
check_service "observability" "grafana"

echo ""
echo "2. Checking kube-state-metrics"
echo "-------------------------------"

check_deployment "kube-system" "kube-state-metrics"
check_service "kube-system" "kube-state-metrics"

echo ""
echo "3. Checking RBAC Configuration"
echo "-------------------------------"

echo -n "Checking ServiceAccount... "
if kubectl get sa -n kube-system kube-state-metrics &> /dev/null; then
    echo -e "${GREEN}✓ Exists${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
fi

echo -n "Checking ClusterRole... "
if kubectl get clusterrole kube-state-metrics &> /dev/null; then
    echo -e "${GREEN}✓ Exists${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
fi

echo -n "Checking ClusterRoleBinding... "
if kubectl get clusterrolebinding kube-state-metrics &> /dev/null; then
    echo -e "${GREEN}✓ Exists${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
fi

# Check metrics
check_metrics

# Check Prometheus targets (requires curl)
if command -v curl &> /dev/null; then
    check_prometheus_targets
else
    echo ""
    echo -e "${YELLOW}⚠ Skipping Prometheus targets check (curl not available)${NC}"
fi

# Check Grafana dashboards (requires curl)
if command -v curl &> /dev/null; then
    check_grafana_dashboard
else
    echo ""
    echo -e "${YELLOW}⚠ Skipping Grafana dashboard check (curl not available)${NC}"
fi

echo ""
echo "========================================"
echo "Verification Complete"
echo "========================================"
echo ""
echo "To access Grafana:"
echo "  kubectl port-forward -n observability svc/grafana 3000:3000"
echo "  Then visit: http://localhost:3000"
echo ""
echo "To access Prometheus:"
echo "  kubectl port-forward -n observability svc/prometheus 9090:9090"
echo "  Then visit: http://localhost:9090"
echo ""

