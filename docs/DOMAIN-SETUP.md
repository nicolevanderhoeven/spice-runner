# Domain name setup guide

This guide helps you set up a custom domain with HTTPS for your Spice Runner game on Google Kubernetes Engine (GKE).

## Prerequisites

Before you begin, ensure you have the following:

- GKE cluster is running
- Application is deployed (deployment.yaml and service.yaml applied)
- You own a domain name (or are ready to purchase one)
- Access to your domain's DNS settings

## Step 1: Reserve a static IP address

To reserve a static IP address for your ingress, run the following commands:

```bash
# Reserve a global static IP address
gcloud compute addresses create spice-runner-ip \
  --global

# Get the IP address (save this!)
gcloud compute addresses describe spice-runner-ip \
  --global \
  --format="get(address)"
```

{{< admonition type="note" >}}
Note the IP address from the output. You'll need it for DNS configuration in the next step.
{{< /admonition >}}

## Step 2: Configure DNS records

Go to your domain registrar's DNS management page and create an A record with the following values:

```
Type: A
Name: @ (for root domain) or subdomain (e.g., game)
Value: <THE_STATIC_IP_FROM_STEP_1>
TTL: 3600 (or default)
```

### Examples

Use these examples to configure your DNS records:

- **Root domain**: `spice-runner.com` → Use `@` as name
- **Subdomain**: `game.spice-runner.com` → Use `game` as name

DNS propagation can take 5-60 minutes. To check DNS propagation status, run the following commands:

```bash
dig your-domain.com
# or
nslookup your-domain.com
```

## Step 3: Update Kubernetes manifests

Update the Kubernetes manifests to use your actual domain name.

### Update ingress.yaml

Replace _`<YOUR_DOMAIN>`_ with your actual domain in `k8s/ingress.yaml`. You can use `sed` or manually edit the file:

```bash
# Option 1: Using sed (Mac)
sed -i '' 's/your-domain.com/your-actual-domain.com/g' k8s/ingress.yaml

# Option 2: Manually edit the file
```

### Update managed-certificate.yaml

Replace _`<YOUR_DOMAIN>`_ with your actual domain in `k8s/managed-certificate.yaml`. You can use `sed` or manually edit the file:

```bash
# Option 1: Using sed (Mac)
sed -i '' 's/your-domain.com/your-actual-domain.com/g' k8s/managed-certificate.yaml

# Option 2: Manually edit the file
```

## Step 4: Deploy ingress and certificate

To deploy the ingress and managed certificate, run the following commands:

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

## Step 5: Wait for HTTPS certificate

Google's managed certificate can take 10-20 minutes to provision. To monitor the certificate status, run the following command:

```bash
# Watch certificate status
kubectl describe managedcertificate spice-runner-cert

# Look for these statuses:
# - Provisioning: Certificate is being created
# - Active: Certificate is ready (HTTPS working!)
# - FailedNotVisible: DNS not configured correctly or not propagated yet
```

**Common issues:**

- **FailedNotVisible**: DNS hasn't propagated yet. Wait longer or check DNS records.
- **Provisioning stuck**: Make sure DNS A record points to the correct IP.

## Step 6: Access your game

Once the certificate shows **Active** status, you can access your game.

### HTTP (available immediately)

```
http://<YOUR_DOMAIN>
```

### HTTPS (available after certificate is Active)

```
https://<YOUR_DOMAIN>
```

{{< admonition type="note" >}}
GKE automatically redirects HTTP to HTTPS once the certificate is active.
{{< /admonition >}}

## Verification commands

To verify your deployment, run the following commands:

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

This section helps you diagnose and resolve common issues.

### Ingress stuck on "Creating"

This is normal and can take 5-10 minutes. The load balancer is being provisioned.

### Certificate stuck on "Provisioning"

If the certificate is stuck in the Provisioning state, check the following:

- Verify DNS A record points to correct IP
- Wait for DNS propagation (can take up to 1 hour)
- Check that your domain is accessible via HTTP first

### "FailedNotVisible" certificate error

The certificate verification failed. Common causes include:

1. DNS not configured correctly
2. DNS hasn't propagated yet (wait 30-60 minutes)
3. Wrong IP in A record
4. Domain name mismatch in ingress/certificate config

### Getting 404 errors

If you receive 404 errors, check the following:

- Check that service is running: `kubectl get svc`
- Check pods are running: `kubectl get pods`
- Verify ingress backend: `kubectl describe ingress spice-runner-ingress`

## Cost considerations

The following components incur charges:

- **Static IP**: Approximately $0.01/hour when in use (approximately $7/month)
- **Ingress/Load Balancer**: Approximately $0.025/hour (approximately $18/month)
- **Managed Certificate**: Free
- **Total**: Approximately $25/month for the networking components

## Cleanup

To remove all resources and stop charges, run the following commands:

```bash
# Delete Kubernetes resources
kubectl delete -f k8s/

# Release the static IP
gcloud compute addresses delete spice-runner-ip --global

# Delete the cluster
gcloud container clusters delete spice-runner-cluster --zone=us-central1-a
```

## Using a subdomain

If you want to use a subdomain (for example, `game.yourdomain.com`), follow these steps:

1. Create DNS A record with subdomain as name.
2. Update both `ingress.yaml` and `managed-certificate.yaml` with full subdomain.
3. Apply the changes.

## Multiple domains

To support multiple domains (for example, www and non-www), configure the manifests as follows:

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

