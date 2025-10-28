# Setup Guide for nvdh.dev/spice

This guide is customized for deploying Spice Runner at `https://nvdh.dev/spice`.

## Prerequisites

- GKE cluster is running with your app deployed
- You have access to DNS settings for nvdh.dev

## Step 1: Reserve Static IP

```bash
# Reserve a global static IP
gcloud compute addresses create spice-runner-ip --global

# Get the IP address (you'll need this for DNS)
gcloud compute addresses describe spice-runner-ip --global --format="get(address)"
```

**Save this IP address!** You'll need it in the next step.

## Step 2: Configure DNS

Go to your DNS provider for `nvdh.dev` and create/update an **A record**:

```
Type: A
Name: @ (for root domain nvdh.dev)
Value: <THE_STATIC_IP_FROM_STEP_1>
TTL: 3600
```

**Verify DNS propagation:**
```bash
dig nvdh.dev

# Or
nslookup nvdh.dev
```

Wait until the DNS resolves to your new IP before continuing (can take 5-60 minutes).

## Step 3: Rebuild Docker Image

The Nginx configuration has been updated to serve content from `/spice` path. Rebuild and push:

```bash
# Rebuild with the new nginx.conf
docker build --platform linux/amd64 -t gcr.io/dev-advocacy-380120/spice-runner:latest .

# Push to registry
docker push gcr.io/dev-advocacy-380120/spice-runner:latest

# Restart deployment to use new image
kubectl rollout restart deployment/spice-runner
```

## Step 4: Update Service Type

The service needs to be ClusterIP (not LoadBalancer) for Ingress to work:

```bash
# Apply the updated service configuration
kubectl apply -f k8s/service.yaml

# Verify it changed to ClusterIP
kubectl get service spice-runner-service
```

## Step 5: Deploy Certificate and Ingress

```bash
# Deploy the managed certificate
kubectl apply -f k8s/managed-certificate.yaml

# Deploy the ingress
kubectl apply -f k8s/ingress.yaml

# Check ingress status
kubectl get ingress spice-runner-ingress

# Check certificate status (will show "Provisioning" initially)
kubectl describe managedcertificate spice-runner-cert
```

## Step 6: Wait for Certificate Provisioning

Google's managed certificate takes **10-20 minutes** to provision:

```bash
# Watch certificate status
watch kubectl describe managedcertificate spice-runner-cert

# Look for status: Active (means it's ready!)
```

**Certificate Status Meanings:**
- `Provisioning` - Certificate is being created (normal, wait 10-20 min)
- `Active` - Certificate ready! HTTPS is working
- `FailedNotVisible` - DNS not configured or hasn't propagated yet

## Step 7: Access Your Game! 🎮

Once the certificate shows **Active**:

### Your game will be available at:
- **HTTPS:** `https://nvdh.dev/spice`
- **HTTP:** `http://nvdh.dev/spice` (will auto-redirect to HTTPS)

**Root redirect:** Visiting `https://nvdh.dev/` will automatically redirect to `https://nvdh.dev/spice/`

## Verification

```bash
# Test HTTP (will redirect to HTTPS once cert is active)
curl -L http://nvdh.dev/spice

# Test HTTPS
curl https://nvdh.dev/spice

# Check all resources are working
curl https://nvdh.dev/spice/
curl https://nvdh.dev/spice/scripts/runner.js
curl https://nvdh.dev/spice/img/1x-trex.png
```

## Troubleshooting

### Getting 404 on /spice path
- Make sure you rebuilt and pushed the Docker image with the new `nginx.conf`
- Verify deployment is using the latest image: `kubectl describe pod -l app=spice-runner`

### Certificate stuck on "Provisioning"
- Verify DNS: `dig nvdh.dev` should show your static IP
- Wait longer (can take up to 20 minutes)
- Check the certificate events: `kubectl describe managedcertificate spice-runner-cert`

### Images/scripts not loading
- Check browser console for 404 errors
- Verify paths in nginx.conf are correct
- Check if trailing slash matters: try both `nvdh.dev/spice` and `nvdh.dev/spice/`

### "FailedNotVisible" certificate error
1. Verify DNS A record points to the correct static IP
2. Wait for DNS to propagate (30-60 minutes)
3. Test that `http://nvdh.dev` is accessible (even if showing wrong content)

## Current Configuration Summary

- **Domain:** nvdh.dev
- **Path:** /spice
- **Full URL:** https://nvdh.dev/spice
- **SSL:** Free Google-managed certificate
- **Redirects:** 
  - `nvdh.dev/` → `nvdh.dev/spice/`
  - HTTP → HTTPS (automatic after cert is active)

## Costs

- **Static IP:** ~$0.01/hour (~$7/month)
- **Ingress/Load Balancer:** ~$0.025/hour (~$18/month)
- **SSL Certificate:** FREE
- **Total Networking:** ~$25/month

## Adding Other Services

If you want to host other services on nvdh.dev, you can add more paths to the ingress:

```yaml
# In k8s/ingress.yaml
spec:
  rules:
  - host: nvdh.dev
    http:
      paths:
      - path: /spice
        pathType: Prefix
        backend:
          service:
            name: spice-runner-service
            port:
              number: 80
      - path: /other-app
        pathType: Prefix
        backend:
          service:
            name: other-service
            port:
              number: 80
```

You only need one static IP and one certificate for the entire domain!


