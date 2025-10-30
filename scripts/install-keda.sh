#!/bin/bash

# ============================================================================
# KEDA Installation Script for Spice Runner
# ============================================================================
# This script installs KEDA (Kubernetes Event-Driven Autoscaling) and
# configures it for the Spice Runner application.
#
# KEDA will scale the application from 0 to 10 pods based on:
# - HTTP request rate (Prometheus)
# - CPU utilization
# - Memory utilization
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# Prerequisites Check
# ============================================================================

log_info "Checking prerequisites..."

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed. Please install kubectl first."
    exit 1
fi
log_success "kubectl found"

# Check helm
if ! command -v helm &> /dev/null; then
    log_error "helm is not installed. Please install helm first."
    echo ""
    echo "Install Helm:"
    echo "  macOS: brew install helm"
    echo "  Linux: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
    exit 1
fi
log_success "helm found"

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
    exit 1
fi
log_success "Connected to Kubernetes cluster: $(kubectl config current-context)"

# ============================================================================
# Check if KEDA is already installed
# ============================================================================

log_info "Checking if KEDA is already installed..."

if kubectl get namespace keda &> /dev/null; then
    log_warning "KEDA namespace already exists"
    
    read -p "Do you want to upgrade/reinstall KEDA? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping KEDA installation"
        SKIP_INSTALL=true
    else
        SKIP_INSTALL=false
    fi
else
    SKIP_INSTALL=false
fi

# ============================================================================
# Install KEDA
# ============================================================================

if [ "$SKIP_INSTALL" = false ]; then
    log_info "Installing KEDA..."
    
    # Add KEDA Helm repository
    log_info "Adding KEDA Helm repository..."
    helm repo add kedacore https://kedacore.github.io/charts
    helm repo update
    log_success "KEDA Helm repository added"
    
    # Install KEDA
    log_info "Installing KEDA operator..."
    helm upgrade --install keda kedacore/keda \
        --namespace keda \
        --create-namespace \
        --set prometheus.metricServer.enabled=true \
        --set prometheus.metricServer.port=9022 \
        --set prometheus.operator.enabled=true \
        --wait \
        --timeout 5m
    
    log_success "KEDA installed successfully"
else
    log_info "Using existing KEDA installation"
fi

# ============================================================================
# Verify KEDA Installation
# ============================================================================

log_info "Verifying KEDA installation..."

# Wait for KEDA pods to be ready
log_info "Waiting for KEDA pods to be ready..."
kubectl wait --for=condition=ready pod \
    -l app.kubernetes.io/name=keda-operator \
    -n keda \
    --timeout=300s

kubectl wait --for=condition=ready pod \
    -l app.kubernetes.io/name=keda-operator-metrics-apiserver \
    -n keda \
    --timeout=300s

log_success "KEDA pods are ready"

# Check KEDA components
echo ""
log_info "KEDA Components:"
kubectl get pods -n keda

echo ""
log_info "KEDA Version:"
kubectl get deployment keda-operator -n keda -o jsonpath='{.spec.template.spec.containers[0].image}'
echo ""

# ============================================================================
# Check Prerequisites for ScaledObject
# ============================================================================

log_info "Checking prerequisites for ScaledObject..."

# Check if Prometheus exists
if kubectl get svc prometheus -n observability &> /dev/null; then
    log_success "Prometheus service found in observability namespace"
else
    log_warning "Prometheus service not found. KEDA will use fallback replicas if Prometheus metrics fail."
fi

# Check if deployment exists
if kubectl get deployment spice-runner -n default &> /dev/null; then
    log_success "spice-runner deployment found"
else
    log_error "spice-runner deployment not found. Please deploy the application first."
    exit 1
fi

# ============================================================================
# Handle Existing HPA
# ============================================================================

log_info "Checking for existing HPA..."

if kubectl get hpa spice-runner-hpa -n default &> /dev/null; then
    log_warning "Existing HPA found: spice-runner-hpa"
    echo ""
    echo "IMPORTANT: KEDA will create its own HPA. You should remove the existing HPA."
    echo ""
    echo "Options:"
    echo "  1. Delete HPA now (recommended)"
    echo "  2. Keep HPA for comparison (may conflict)"
    echo "  3. Skip for now"
    echo ""
    read -p "Choose option (1/2/3): " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            kubectl delete hpa spice-runner-hpa -n default
            log_success "Existing HPA deleted"
            ;;
        2)
            log_warning "Keeping existing HPA. This may cause conflicts with KEDA."
            ;;
        3)
            log_info "Skipping HPA cleanup"
            ;;
        *)
            log_warning "Invalid option. Skipping HPA cleanup."
            ;;
    esac
else
    log_success "No existing HPA found"
fi

# ============================================================================
# Apply ScaledObject
# ============================================================================

echo ""
log_info "Applying KEDA ScaledObject configuration..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
KEDA_CONFIG="$SCRIPT_DIR/../k8s/keda-scaledobject.yaml"

if [ -f "$KEDA_CONFIG" ]; then
    kubectl apply -f "$KEDA_CONFIG"
    log_success "ScaledObject created: spice-runner-keda"
else
    log_error "KEDA configuration file not found: $KEDA_CONFIG"
    exit 1
fi

# Wait a moment for ScaledObject to be processed
sleep 3

# ============================================================================
# Verify ScaledObject
# ============================================================================

log_info "Verifying ScaledObject..."

# Check ScaledObject status
if kubectl get scaledobject spice-runner-keda -n default &> /dev/null; then
    log_success "ScaledObject created successfully"
    
    echo ""
    log_info "ScaledObject Status:"
    kubectl get scaledobject spice-runner-keda -n default
    
    echo ""
    log_info "ScaledObject Details:"
    kubectl describe scaledobject spice-runner-keda -n default | grep -A 10 "Status:"
else
    log_error "ScaledObject not found"
    exit 1
fi

# Check KEDA-managed HPA
echo ""
log_info "KEDA-managed HPA:"
kubectl get hpa -n default | grep keda || echo "HPA not created yet (will be created when scaling is active)"

# ============================================================================
# Check Current State
# ============================================================================

echo ""
log_info "Current Deployment State:"
kubectl get deployment spice-runner -n default

echo ""
log_info "Current Pods:"
kubectl get pods -n default -l app=spice-runner

# ============================================================================
# Success Summary
# ============================================================================

echo ""
echo "============================================================================"
log_success "KEDA Installation Complete!"
echo "============================================================================"
echo ""
echo "KEDA is now managing autoscaling for spice-runner with:"
echo "  • Min replicas: 0 (scale to zero)"
echo "  • Max replicas: 10"
echo "  • Triggers:"
echo "    - HTTP request rate > 50 req/s"
echo "    - CPU utilization > 70%"
echo "    - Memory utilization > 75%"
echo ""
echo "Next Steps:"
echo ""
echo "1. Monitor ScaledObject:"
echo "   kubectl get scaledobject spice-runner-keda -n default -w"
echo ""
echo "2. Watch for scale-to-zero (after 5 minutes of no traffic):"
echo "   watch kubectl get pods -l app=spice-runner -n default"
echo ""
echo "3. Run load test to trigger scaling:"
echo "   ./scripts/run-hpa-test.sh"
echo ""
echo "4. View KEDA metrics:"
echo "   kubectl get hpa -n default"
echo "   kubectl describe scaledobject spice-runner-keda -n default"
echo ""
echo "5. Check KEDA operator logs:"
echo "   kubectl logs -n keda -l app.kubernetes.io/name=keda-operator --tail=50 -f"
echo ""
echo "Documentation:"
echo "  • KEDA Testing Guide: See KEDA-TESTING.md"
echo "  • KEDA Dashboard: kubectl port-forward -n keda svc/keda-operator-metrics-apiserver 8080:443"
echo ""
echo "============================================================================"

