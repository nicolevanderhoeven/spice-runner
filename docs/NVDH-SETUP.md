# Setup guide for nvdh.dev/spice

This guide helps you deploy Spice Runner at `https://nvdh.dev/spice`.

## Prerequisites

Before you begin, ensure you have the following:

- GKE cluster is running with your application deployed
- You have access to DNS settings for nvdh.dev

## Step 1: Reserve static IP

To reserve a static IP address, run the following commands:

```bash
# Reserve a global static IP
gcloud compute addresses create spice-runner-ip --global

# Get the IP address (you'll need this for DNS)
gcloud compute addresses describe spice-runner-ip --global --format="get(address)"
```

{{< admonition type="note" >}}
Save this IP address. You'll need it in the next step.
{{< /admonition >}}

## Step 2: Configure DNS

Go to your DNS provider for `nvdh.dev` and create/update an **A record**:

```
Type: A
Name: @ (for root domain nvdh.dev)
Value: <THE_STATIC_IP_FROM_STEP_1>
TTL: 3600
```

To verify DNS propagation, run the following command:

```bash
dig nvdh.dev

# Or
nslookup nvdh.dev
```

Wait until the DNS resolves to your new IP before continuing (can take 5-60 minutes).

## Step 3: Rebuild Docker image

The NGINX configuration has been updated to serve content from the `/spice` path. To rebuild and push the image, run the following commands:

```bash
# Rebuild with the new nginx.conf
docker build --platform linux/amd64 -t gcr.io/dev-advocacy-380120/spice-runner:latest .

# Push to registry
docker push gcr.io/dev-advocacy-380120/spice-runner:latest

# Restart deployment to use new image
kubectl rollout restart deployment/spice-runner
```

## Step 4: Update service type

The service needs to be ClusterIP (not LoadBalancer) for Ingress to work. To update the service, run the following commands:

```bash
# Apply the updated service configuration
kubectl apply -f k8s/service.yaml

# Verify it changed to ClusterIP
kubectl get service spice-runner-service
```

## Step 5: Deploy certificate and ingress

To deploy the managed certificate and ingress, run the following commands:

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

## Step 6: Wait for certificate provisioning

Google's managed certificate takes 10-20 minutes to provision. To monitor the certificate status, run the following command:

```bash
# Watch certificate status
watch kubectl describe managedcertificate spice-runner-cert

# Look for status: Active (means it's ready!)
```

**Certificate status meanings:**

- `Provisioning`: Certificate is being created (normal, wait 10-20 minutes)
- `Active`: Certificate ready, HTTPS is working
- `FailedNotVisible`: DNS not configured or hasn't propagated yet

## Step 7: Access your game

Once the certificate shows **Active** status, your game will be available at the following URLs:

- **HTTPS**: `https://nvdh.dev/spice`
- **HTTP**: `http://nvdh.dev/spice` (will auto-redirect to HTTPS)

**Root redirect**: Visiting `https://nvdh.dev/` will automatically redirect to `https://nvdh.dev/spice/`

## Verification

To verify your deployment, run the following commands:

```bash
# Test HTTP (will redirect to HTTPS once cert is active)
curl -L http://nvdh.dev/spice

# Test HTTPS
curl https://nvdh.dev/spice

# Check all resources are working
curl https://nvdh.dev/spice/
curl https://nvdh.dev/spice/scripts/runner.js
curl https://nvdh.dev/spice/img/1x-fremen.png
```

## Troubleshooting

This section helps you diagnose and resolve common issues.

### Getting 404 on /spice path

If you receive 404 errors on the `/spice` path, check the following:
- Make sure you rebuilt and pushed the Docker image with the new `nginx.conf`
- Verify deployment is using the latest image: `kubectl describe pod -l app=spice-runner`

### Certificate stuck on "Provisioning"

If the certificate is stuck in Provisioning state, try the following:
- Verify DNS: `dig nvdh.dev` should show your static IP
- Wait longer (can take up to 20 minutes)
- Check the certificate events: `kubectl describe managedcertificate spice-runner-cert`

### Images or scripts not loading

If images or scripts aren't loading, check the following:
- Check browser console for 404 errors
- Verify paths in nginx.conf are correct
- Check if trailing slash matters: try both `nvdh.dev/spice` and `nvdh.dev/spice/`

### "FailedNotVisible" certificate error

If you receive a "FailedNotVisible" error, take the following actions:

1. Verify DNS A record points to the correct static IP
2. Wait for DNS to propagate (30-60 minutes)
3. Test that `http://nvdh.dev` is accessible (even if showing wrong content)

## Current configuration summary

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

## Adding other services

If you want to host other services on nvdh.dev, you can add more paths to the ingress. Use the following configuration as an example:

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


