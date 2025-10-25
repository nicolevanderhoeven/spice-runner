# Domain Name Setup Guide

This guide walks you through setting up a custom domain with HTTPS for your Spice Runner game on GKE.

## Prerequisites

- GKE cluster is running
- App is deployed (deployment.yaml and service.yaml applied)
- You own a domain name (or are ready to purchase one)
- Access to your domain's DNS settings

## Step 1: Reserve a Static IP Address

```bash
# Reserve a global static IP address
gcloud compute addresses create spice-runner-ip \
  --global

# Get the IP address (save this!)
gcloud compute addresses describe spice-runner-ip \
  --global \
  --format="get(address)"
```

**Important:** Note the IP address - you'll need it for DNS configuration.

## Step 2: Configure DNS Records

Go to your domain registrar's DNS management page and create an **A record**:

```
Type: A
Name: @ (for root domain) or subdomain (e.g., game)
Value: <THE_STATIC_IP_FROM_STEP_1>
TTL: 3600 (or default)
```

### Examples:
- **Root domain:** `spice-runner.com` → Use `@` as name
- **Subdomain:** `game.spice-runner.com` → Use `game` as name

**Note:** DNS propagation can take 5-60 minutes. You can check with:
```bash
dig your-domain.com
# or
nslookup your-domain.com
```

## Step 3: Update Kubernetes Manifests

### Update `k8s/ingress.yaml`

Replace `your-domain.com` with your actual domain:

```bash
# Option 1: Using sed (Mac)
sed -i '' 's/your-domain.com/your-actual-domain.com/g' k8s/ingress.yaml

# Option 2: Manually edit the file
```

### Update `k8s/managed-certificate.yaml`

Replace `your-domain.com` with your actual domain:

```bash
# Option 1: Using sed (Mac)
sed -i '' 's/your-domain.com/your-actual-domain.com/g' k8s/managed-certificate.yaml

# Option 2: Manually edit the file
```

## Step 4: Deploy Ingress and Certificate

```bash
# Apply the managed certificate (for HTTPS)
kubectl apply -f k8s/managed-certificate.yaml

# Apply the ingress
kubectl apply -f k8s/ingress.yaml

# Check ingress status
kubectl get ingress spice-runner-ingress

# Check certificate status (will take 10-20 minutes to provision)
kubectl describe managedcertificate spice-runner-cert
```

## Step 5: Wait for HTTPS Certificate

Google's managed certificate can take **10-20 minutes** to provision. Monitor the status:

```bash
# Watch certificate status
kubectl describe managedcertificate spice-runner-cert

# Look for these statuses:
# - Provisioning: Certificate is being created
# - Active: Certificate is ready (HTTPS working!)
# - FailedNotVisible: DNS not configured correctly or not propagated yet
```

**Common Issues:**
- **FailedNotVisible**: DNS hasn't propagated yet. Wait longer or check DNS records.
- **Provisioning stuck**: Make sure DNS A record points to the correct IP.

## Step 6: Access Your Game

Once the certificate shows **Active** status:

### HTTP (available immediately):
```
http://your-domain.com
```

### HTTPS (available after certificate is Active):
```
https://your-domain.com
```

**Note:** GKE automatically redirects HTTP to HTTPS once the certificate is active.

## Verification Commands

```bash
# Check if DNS is resolving correctly
dig your-domain.com

# Check ingress IP
kubectl get ingress spice-runner-ingress

# Check certificate status
kubectl get managedcertificate spice-runner-cert

# Detailed certificate info
kubectl describe managedcertificate spice-runner-cert

# Test HTTP access
curl http://your-domain.com

# Test HTTPS access (after cert is active)
curl https://your-domain.com
```

## Troubleshooting

### Ingress stuck on "Creating"
This is normal and can take 5-10 minutes. The load balancer is being provisioned.

### Certificate stuck on "Provisioning"
- Verify DNS A record points to correct IP
- Wait for DNS propagation (can take up to 1 hour)
- Check that your domain is accessible via HTTP first

### "FailedNotVisible" certificate error
The certificate verification failed. Common causes:
1. DNS not configured correctly
2. DNS hasn't propagated yet (wait 30-60 minutes)
3. Wrong IP in A record
4. Domain name mismatch in ingress/certificate config

### Getting 404 errors
- Check that service is running: `kubectl get svc`
- Check pods are running: `kubectl get pods`
- Verify ingress backend: `kubectl describe ingress spice-runner-ingress`

## Cost Considerations

- **Static IP:** ~$0.01/hour when in use (~$7/month)
- **Ingress/Load Balancer:** ~$0.025/hour (~$18/month)
- **Managed Certificate:** FREE
- **Total:** ~$25/month for the networking components

## Cleanup

To remove everything and stop charges:

```bash
# Delete Kubernetes resources
kubectl delete -f k8s/

# Release the static IP
gcloud compute addresses delete spice-runner-ip --global

# Delete the cluster
gcloud container clusters delete spice-runner-cluster --zone=us-central1-a
```

## Using a Subdomain

If you want to use a subdomain (e.g., `game.yourdomain.com`):

1. Create DNS A record with subdomain as name
2. Update both `ingress.yaml` and `managed-certificate.yaml` with full subdomain
3. Apply the changes

## Multiple Domains

To support multiple domains (e.g., www and non-www):

```yaml
# In managed-certificate.yaml
spec:
  domains:
    - yourdomain.com
    - www.yourdomain.com

# In ingress.yaml
spec:
  rules:
  - host: yourdomain.com
    http:
      paths: [...]
  - host: www.yourdomain.com
    http:
      paths: [...]
```

