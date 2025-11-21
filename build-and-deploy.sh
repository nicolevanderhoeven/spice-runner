#!/bin/bash
set -e

# Spice Runner - Build and Deploy Script
# This script builds, pushes, and deploys in one command

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Spice Runner Build & Deploy ===${NC}"

# Step 1: Build and push
echo -e "${GREEN}📦 Building and pushing Docker image...${NC}"
./build-and-push.sh

# Get the version from the last commit
VERSION=$(git rev-parse --short HEAD)

echo ""
echo -e "${GREEN}🚀 Deploying to Kubernetes...${NC}"

# Step 2: Deploy to Kubernetes
kubectl set image deployment/spice-runner \
    spice-runner=gcr.io/dev-advocacy-380120/spice-runner:${VERSION} \
    -n default

# Step 3: Wait for rollout
echo -e "${BLUE}⏳ Waiting for rollout to complete...${NC}"
kubectl rollout status deployment/spice-runner -n default

# Step 4: Verify
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
kubectl get pods -l app=spice-runner -o wide

echo ""
echo -e "${BLUE}🌐 Site should be updated at: https://nvdh.dev/spice/${NC}"
echo -e "${YELLOW}💡 Tip: Hard refresh (Cmd+Shift+R) to see changes${NC}"

