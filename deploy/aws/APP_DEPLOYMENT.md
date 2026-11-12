# AWS application hosting — no Docker

This guide runs the Node.js API directly on an EC2 instance. Docker, containers,
container images and Docker Compose are not used.

For an initial deployment, keep the API and WebSocket media bridge on one small
EC2 instance in the same VPC as RDS. Host the static React build separately on
AWS Amplify or S3 + CloudFront. This avoids introducing ECS, NAT Gateway and a
load balancer before the product needs them. These services can add charges.

## Suggested topology

- React static site: AWS Amplify Hosting (set `VITE_API_URL`).
- Express + WebSocket API: Node.js process on EC2, managed by `systemd`.
- Reverse proxy: Nginx with HTTPS and WebSocket upgrade forwarding.
- PostgreSQL: private Amazon RDS subnet group.
- RDS ingress: TCP 5432 from the API EC2 security group only.

## EC2 setup (Amazon Linux 2023)

1. Launch an eligible small Amazon Linux 2023 instance in the same VPC as RDS.
2. Attach `leadflow-app-sg` to the EC2 instance.
3. Give the instance a minimal IAM role for Systems Manager and, if used,
   Secrets Manager access. Do not place AWS access keys on the server.
4. Use Systems Manager Session Manager for administration where possible.
5. Update packages and install Node.js 22, Git, Nginx and PostgreSQL client tools:

   ```bash
   sudo dnf update -y
   sudo dnf install -y git nginx postgresql15
   ```

   Install Node.js 22 using the current Node.js installation instructions for
   Amazon Linux 2023. Verify `node --version` is 22 or newer and `npm --version`
   is 10 or newer before continuing.

6. Create a dedicated Linux account and application directory:

   ```bash
   sudo useradd --system --create-home --shell /sbin/nologin leadflow
   sudo mkdir -p /opt/leadflow
   sudo chown leadflow:leadflow /opt/leadflow
   ```

7. Clone the private repository as the `leadflow` user into `/opt/leadflow`.
   If you download a release archive instead, extract it into this directory.
8. Install dependencies and build the frontend:

   ```bash
   cd /opt/leadflow
   sudo -u leadflow npm install
   sudo -u leadflow npm run build
   ```

9. Download the current RDS CA bundle from
   `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` and
   install it in a readable system certificate directory:

   ```bash
   sudo mkdir -p /etc/leadflow/certs
   sudo curl -o /etc/leadflow/certs/global-bundle.pem \
     https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   sudo chmod 644 /etc/leadflow/certs/global-bundle.pem
   ```

10. Create `/etc/leadflow/server.env` with the production values. Restrict access:

    ```bash
    sudo install -o root -g leadflow -m 640 /dev/null /etc/leadflow/server.env
    sudo nano /etc/leadflow/server.env
    ```

    Use the least-privilege `leadflow_app` RDS role, not the RDS master user.
    Set `NODE_ENV=production`, `DATABASE_SSL=true`,
    `DATABASE_SSL_REJECT_UNAUTHORIZED=true` and
    `DATABASE_SSL_CA_PATH=/etc/leadflow/certs/global-bundle.pem`.
    Set `CLIENT_ORIGIN` to the exact deployed frontend origin. Keep all API
    secrets in this server-side file or inject them from AWS Secrets Manager.

11. Install the systemd unit:

    ```bash
    sudo cp /opt/leadflow/deploy/aws/leadflow-api.service.example \
      /etc/systemd/system/leadflow-api.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now leadflow-api
    sudo systemctl status leadflow-api
    ```

12. Install Nginx and configure HTTPS. Copy
    `deploy/aws/nginx-api.conf.example` to an Nginx site configuration, replace
    the domain and certificate paths, validate with `sudo nginx -t`, then run
    `sudo systemctl enable --now nginx`.
13. Set `PUBLIC_API_URL=https://api.yourdomain.com` and make sure the `/media`
    WebSocket route forwards upgrade headers. Redact query strings from proxy
    logs: short-lived media tokens and callback secrets can appear in URL query
    values.
14. Add the EC2 security group as the only inbound source for RDS TCP 5432.
15. Configure CloudWatch logs, instance monitoring and budget alarms.

## Run database migrations

Run migrations from the application directory using the production environment.
A safe operational approach is to load the environment file in a controlled
shell and execute the migration before restarting the API:

```bash
cd /opt/leadflow
set -a
. /etc/leadflow/server.env
set +a
npm run db:migrate
```

Do not paste passwords into shell history. For a production deployment, prefer
AWS Secrets Manager / SSM Parameter Store and a controlled deployment script
that injects secrets without printing them.

## Useful service commands

```bash
sudo systemctl status leadflow-api
sudo journalctl -u leadflow-api -f
sudo systemctl restart leadflow-api
sudo systemctl stop leadflow-api
sudo nginx -t
sudo systemctl reload nginx
```

## AWS Amplify frontend

1. Connect the private repository in AWS Amplify Hosting.
2. Set the app root to `client`.
3. Add `VITE_API_URL=https://api.yourdomain.com/api`.
4. Build command: `npm install && npm run build`.
5. Artifact directory: `dist`.
6. Add the Amplify frontend origin to the API `CLIENT_ORIGIN` variable.

`VITE_` variables are public and embedded in the browser bundle. Never put
passwords, JWT signing keys, RDS credentials or provider API tokens in them.

## Cost notes

- Check the account's current Free Tier / credits before launching EC2.
- Avoid NAT Gateway for the initial design unless private outbound access is
  required; NAT Gateway has hourly and data processing charges.
- Public IPv4, EBS volumes, snapshots, data transfer, load balancers and logs may
  be billable even when the instance is eligible for a compute offer.
- Stopping EC2 does not necessarily stop charges for attached storage or public
  IPv4 resources.
