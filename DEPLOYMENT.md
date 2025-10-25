# Deployment Guide - Spice Runner on GKE

## Prerequisites
- GCP project set up
- `gcloud` CLI installed and authenticated
- `kubectl` installed
- Docker installed locally

## Step 1: Set Up GCP Environment

```bash
# Set your GCP project ID
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable container.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## Step 2: Create GKE Cluster

```bash
# Create a GKE cluster (this will take several minutes)
gcloud container clusters create spice-runner-cluster \
  --zone=us-central1-a \
  --num-nodes=2 \
  --machine-type=e2-medium \
  --disk-size=10

# Get credentials for kubectl
gcloud container clusters get-credentials spice-runner-cluster \
  --zone=us-central1-a
```

**Note:** You can adjust the zone, number of nodes, and machine type based on your needs and costs.

## Step 3: Build and Push Docker Image

```bash
# Build the Docker image for AMD64 architecture (important for GKE compatibility)
# Use --platform flag to ensure compatibility with GKE nodes
docker build --platform linux/amd64 -t gcr.io/$PROJECT_ID/spice-runner:latest .

# Configure Docker to use gcloud as credential helper
gcloud auth configure-docker

# Push the image to Google Container Registry
docker push gcr.io/$PROJECT_ID/spice-runner:latest
```

**Important Note for Mac Users (especially Apple Silicon M1/M2/M3):** The `--platform linux/amd64` flag is **required** to build images compatible with GKE nodes. Without it, you'll get `exec format error` when pods try to start.

## Step 4: Update Kubernetes Manifests

Before deploying, update the image reference in `k8s/deployment.yaml`:

```bash
# Replace YOUR_PROJECT_ID with your actual project ID
sed -i '' "s/YOUR_PROJECT_ID/$PROJECT_ID/g" k8s/deployment.yaml
```

Or manually edit `k8s/deployment.yaml` and replace `YOUR_PROJECT_ID` with your actual GCP project ID.

## Step 5: Deploy to Kubernetes

```bash
# Apply the deployment
kubectl apply -f k8s/deployment.yaml

# Apply the service
kubectl apply -f k8s/service.yaml

# Check deployment status
kubectl get deployments
kubectl get pods

# Get the external IP (this may take a few minutes)
kubectl get service spice-runner-service
```

## Step 6: Access Your Game

### Option A: Using LoadBalancer IP (No Domain)

If you're not using a custom domain, the service will get an external IP:

```bash
# Watch for EXTERNAL-IP to appear (not <pending>)
kubectl get service spice-runner-service --watch
```

Then open your browser and navigate to `http://EXTERNAL-IP`

### Option B: Using a Custom Domain with HTTPS

If you want to use a custom domain (e.g., `yourdomain.com`), follow the **DOMAIN-SETUP.md** guide. This will:
- Give you a custom domain name
- Provide automatic HTTPS/SSL certificates
- Use Google-managed certificates (free)

**Note:** Using a domain requires changing the service type from `LoadBalancer` to `ClusterIP` and adding an Ingress resource.

## Useful Commands

```bash
# View logs
kubectl logs -l app=spice-runner

# Scale the deployment
kubectl scale deployment spice-runner --replicas=3

# Update the image after rebuilding
docker build --platform linux/amd64 -t gcr.io/$PROJECT_ID/spice-runner:v2 .
docker push gcr.io/$PROJECT_ID/spice-runner:v2
kubectl set image deployment/spice-runner spice-runner=gcr.io/$PROJECT_ID/spice-runner:v2

# Delete everything
kubectl delete -f k8s/
gcloud container clusters delete spice-runner-cluster --zone=us-central1-a
```

## Cost Optimization Tips

1. **Use Autopilot mode** for easier management:
   ```bash
   gcloud container clusters create-auto spice-runner-cluster \
     --region=us-central1
   ```

2. **Use preemptible nodes** to save costs (for non-production):
   ```bash
   gcloud container clusters create spice-runner-cluster \
     --zone=us-central1-a \
     --num-nodes=2 \
     --preemptible
   ```

3. **Remember to delete resources** when not in use to avoid charges!

## Troubleshooting

### "exec format error" when pods start
This means the Docker image was built for the wrong architecture (likely ARM64 instead of AMD64).

**Solution:**
```bash
# Rebuild with correct platform
docker build --platform linux/amd64 -t gcr.io/$PROJECT_ID/spice-runner:latest .
docker push gcr.io/$PROJECT_ID/spice-runner:latest
kubectl rollout restart deployment/spice-runner
```

### LoadBalancer stuck in "Pending"
GCP is provisioning the external IP. This can take 2-5 minutes. Keep watching:
```bash
kubectl get service spice-runner-service --watch
```

### Pods not starting
Check logs for errors:
```bash
kubectl logs -l app=spice-runner
kubectl describe pods -l app=spice-runner
```

## Next Steps

- **Set up a custom domain with HTTPS** - See `DOMAIN-SETUP.md`
- Set up Cloud Build for CI/CD
- Add health checks and readiness probes
- Configure horizontal pod autoscaling
- Add monitoring with Cloud Monitoring

