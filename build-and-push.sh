#!/bin/bash
set -e

# Spice Runner - Docker Build Script for AMD64
# This script builds, tags, and pushes the Docker image to GCR

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="gcr.io/dev-advocacy-380120"
IMAGE_NAME="spice-runner"
PLATFORM="linux/amd64"

# Get version from git commit hash
VERSION=$(git rev-parse --short HEAD)

echo -e "${BLUE}=== Spice Runner Build Script ===${NC}"
echo -e "${BLUE}Registry:${NC} ${REGISTRY}"
echo -e "${BLUE}Image:${NC} ${IMAGE_NAME}"
echo -e "${BLUE}Version:${NC} ${VERSION}"
echo -e "${BLUE}Platform:${NC} ${PLATFORM}"
echo ""

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    echo "Uncommitted changes:"
    git status -s
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Build cancelled."
        exit 1
    fi
fi

# Build the image
echo -e "${GREEN}🔨 Building Docker image...${NC}"
docker build \
    --platform ${PLATFORM} \
    -t ${REGISTRY}/${IMAGE_NAME}:${VERSION} \
    -t ${REGISTRY}/${IMAGE_NAME}:latest \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
else
    echo -e "${YELLOW}❌ Build failed${NC}"
    exit 1
fi

# Push the images
echo ""
echo -e "${GREEN}📤 Pushing images to GCR...${NC}"

echo "Pushing versioned image: ${VERSION}"
docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}

echo "Pushing latest tag"
docker push ${REGISTRY}/${IMAGE_NAME}:latest

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Push successful!${NC}"
else
    echo -e "${YELLOW}❌ Push failed${NC}"
    exit 1
fi

# Summary
echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
echo -e "Version: ${GREEN}${VERSION}${NC}"
echo -e "Images pushed:"
echo -e "  • ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo -e "  • ${REGISTRY}/${IMAGE_NAME}:latest"
echo ""
echo -e "${BLUE}To deploy this version to Kubernetes, run:${NC}"
echo -e "kubectl set image deployment/spice-runner spice-runner=${REGISTRY}/${IMAGE_NAME}:${VERSION} -n default"
echo ""

