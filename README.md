# 1-Click Deploy

A multi-tenant payment proxy for the [x402 protocol](https://www.x402.org/). Publishers register their APIs, set pricing, and the proxy handles payment validation, settlement, and request routing. Clients pay per-request using on-chain escrow accounts.

## Architecture

```
                          Control Plane
                        (API + UI + Discovery)
                               |
                          PostgreSQL (RDS)
                               |
                     WireGuard mesh (wg1)
                               |
                           API Node
                      (nginx + Lua x402)
                        /            \
              Facilitator          Backend API
           (settles payment)     (proxied request)
                        \            /
                          Client
```

- **API Nodes** handle client requests: TLS termination, subdomain routing, x402 payment validation (via the facilitator), and proxying to the publisher's backend
- **Control Plane** manages tenants, endpoints, pricing, and wallets. Pushes config to API nodes over the WireGuard mesh. Does not handle client traffic.
- **Discovery Service** runs on the control plane and provides a searchable registry of published APIs

**Stacks:**

- **VPC Stack** -- AWS networking (subnets, security groups, NAT)
- **Database Stack** -- PostgreSQL RDS (Multi-AZ, encrypted)
- **Control-Plane Stack** -- EC2 instance running the control-plane API, UI, and discovery service
- **API Node Stack** -- EC2 instance(s) running nginx with Lua for x402 payment processing and request proxying

Nodes communicate over a WireGuard mesh network. wg1 (10.12.0.0/24) handles internal control-plane to API node traffic. wg0 (10.11.0.0/24) ships logs to an external Grafana/Loki endpoint.

## Prerequisites

- **AWS account** with a Route53 hosted zone for your domain
- **AWS CLI** configured with credentials (`aws configure`)
- **Pulumi CLI** ([install](https://www.pulumi.com/docs/install/))
- **Node.js 20.x** ([install](https://nodejs.org/))
- **pnpm** (`npm install -g pnpm`)
- **WireGuard tools** (`apt install wireguard-tools` or `brew install wireguard-tools`)
- **Grafana/Loki endpoint** for centralized logging via wg0 ([Grafana Cloud](https://grafana.com/products/cloud/))

### Clone and initialize

```bash
git clone <repo-url>
cd 1-click-deploy
git submodule update --init
pnpm install
```

The `infra-toolbox` submodule (`github.com/faremeter/infra-toolbox`) provides shared build scripts.

If `make` fails with `./bin/check-env: No such file or directory`, the submodule was not initialized. Run `git submodule update --init` again and verify `ls infra-toolbox/` shows files.

## Generate Secrets

Before deploying, generate all the secrets you will need.

### WireGuard keys

Generate one keypair per node. For a single-node setup (1 control-plane + 1 API node):

```bash
# Control-plane node
wg genkey | tee cp-privatekey | wg pubkey > cp-publickey

# API node
wg genkey | tee api-privatekey | wg pubkey > api-publickey
```

### Database password

```bash
openssl rand -base64 32
```

### Wallet encryption key

```bash
openssl rand -hex 32
```

This produces a 64-character hex string used for encrypting wallet data at rest.

### Find your AMI

Find the latest Debian 13 (Trixie) x86_64 AMI for your region:

```bash
aws ec2 describe-images \
  --owners 136693071363 \
  --filters "Name=name,Values=debian-13-amd64-*" "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text \
  --region us-west-2
```

Replace `us-west-2` with your region. Save the AMI ID for the stack configs.

## Deploy

Deploy the stacks in order. Each stack depends on the outputs of the previous one.

### Step 1: VPC

```bash
cd apps/vpc-stack
pulumi stack init test-1
pulumi config set aws:region us-west-2
pulumi up
```

### Step 2: Database

```bash
cd apps/database-stack
pulumi stack init test-1
pulumi config set aws:region us-west-2
pulumi config set rds:dbName control_plane
pulumi config set rds:masterUsername rds_admin
pulumi config set --secret rds:masterPassword "<your-db-password>"
pulumi config set rds:instanceClass db.t3.medium
pulumi config set rds:allocatedStorage "20"
pulumi config set rds:vpcStackRef "<your-pulumi-org>/vpc/test-1"
pulumi up
```

After the database is up, create the application user. SSH into the control-plane node (deployed in the next step) and run:

```sql
CREATE USER control_plane_1 WITH PASSWORD '<your-app-password>';
GRANT CONNECT ON DATABASE control_plane TO control_plane_1;
GRANT ALL ON SCHEMA public TO control_plane_1;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO control_plane_1;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO control_plane_1;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO control_plane_1;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO control_plane_1;
```

Or use the provided script after the control-plane stack is deployed:

```bash
cd apps/database-stack
./scripts/create-app-user.sh
```

### Step 3: Control-Plane

```bash
cd apps/control-plane-stack
pulumi stack init test-1
```

Configure all required values:

```bash
# Region and AMI
pulumi config set aws:region us-west-2
pulumi config set node:ami <your-ami-id>

# DNS
pulumi config set dns:rootZoneName <your-domain.com>
pulumi config set dns:alternateZoneNames '[]'  # or '["alt-domain.io"]'

# WireGuard (wg0 -- logging network)
pulumi config set --secret wireguard:privateKey "$(cat cp-privatekey)"
pulumi config set wireguard:publicKey "$(cat cp-publickey)"
pulumi config set wireguard:address 10.11.0.1

# WireGuard (wg1 -- internal mesh)
pulumi config set wireguard:multiAddress 10.12.0.1

# Database (use RDS endpoint from Step 2 output)
pulumi config set database:host <rds-endpoint>
pulumi config set database:port "5432"
pulumi config set database:name control_plane
pulumi config set database:user control_plane_1
pulumi config set --secret database:password "<your-app-password>"

# Wallet encryption
pulumi config set --secret wallet:encryptionKey "<your-64-char-hex-key>"

# Service ports
pulumi config set controlPlane:port "1337"
pulumi config set ui:port "1338"
pulumi config set controlPlane:nodeId "1"

# VPC reference
pulumi config set vpc:stackRef "<your-pulumi-org>/vpc/test-1"

# Optional integrations (contact support@corbits.dev for access)
# pulumi config set --secret corbitsDashboard:apiKey "<your-key>"
# pulumi config set --secret attio:apiKey "<your-key>"
# pulumi config set attio:listId "<your-list-id>"
```

Deploy:

```bash
pulumi up
```

### Step 4: Deploy Applications

After the control-plane EC2 instance is running, deploy the applications:

```bash
# Control-plane API (runs migrations on first deploy)
cd apps/control-plane && PULUMI_STACKS="test-1" ./deploy.sh && cd ../..

# Control-plane UI
cd apps/control-plane-ui && PULUMI_STACKS="test-1" ./deploy.sh && cd ../..

# Discovery service
cd apps/discovery && PULUMI_STACKS="test-1" ./deploy.sh && cd ../..
```

### Step 5: API Node

```bash
cd apps/api-node-stack
pulumi stack init test-1
```

Configure:

```bash
# Region and AMI
pulumi config set aws:region us-west-2
pulumi config set node:ami <your-ami-id>

# Control-plane connection (wg1 IP and port)
pulumi config set controlPlane:addresses "10.12.0.1:1337"

# WireGuard (wg0 -- logging)
pulumi config set --secret wireguard:privateKey "$(cat api-privatekey)"
pulumi config set wireguard:publicKey "$(cat api-publickey)"
pulumi config set wireguard:address 10.11.0.2

# WireGuard (wg1 -- internal mesh)
pulumi config set wireguard:multiAddress 10.12.0.2

# Control-plane WireGuard peers (pubkey:wg1-ip:public-ip)
# Get the control-plane public IP:
#   cd apps/control-plane-stack && pulumi stack select test-1
#   pulumi stack output nodes --show-secrets | jq -r '.[0].connection.host'
pulumi config set controlPlane:wgPeers "<cp-pubkey>:10.12.0.1:<cp-public-ip>"

# DNS and identity
pulumi config set dns:rootZoneName <your-domain.com>
pulumi config set api-node:nodeName api-node-1
pulumi config set api-node:nodeId "1"
```

Deploy:

```bash
pulumi up
```

### Step 6: Verify

SSH into the control-plane node:

```bash
cd apps/control-plane-stack
pulumi stack select test-1
ssh -i <key> admin@<control-plane-ip>
```

Check services:

```bash
sudo systemctl status control-plane
sudo systemctl status discovery
sudo systemctl status nginx
sudo wg show
```

SSH into the API node:

```bash
cd apps/api-node-stack
pulumi stack select test-1
ssh -i <key> admin@<api-node-ip>
```

Check services:

```bash
sudo systemctl status nginx
sudo wg show
```

Test the control-plane health endpoint:

```bash
curl https://api.<your-domain.com>/health
```

Test the API node directly (use the API node's public IP):

```bash
curl -k https://<api-node-ip>/
```

The API node should return a 400 or 404 (no tenant configured yet). A connection refused or timeout means nginx isn't running or the security group is blocking port 443.

## High Availability (Optional)

To add a second control-plane node:

```bash
cd apps/control-plane-stack
pulumi stack init test-2
# Same config as test-1, but change:
#   wireguard:address -> 10.11.0.3
#   wireguard:multiAddress -> 10.12.0.20
#   controlPlane:nodeId -> "2"
#   database:user -> control_plane_2 (create this user first)
pulumi up
```

To add a second API node:

```bash
cd apps/api-node-stack
pulumi stack init test-2
# Same config as test-1, but change:
#   wireguard:address -> 10.11.0.4
#   wireguard:multiAddress -> 10.12.0.3
#   api-node:nodeName -> api-node-2
#   api-node:nodeId -> "2"
#   controlPlane:wgPeers -> include both control-plane nodes
pulumi up
```

Route53 weighted routing distributes traffic across control-plane nodes automatically.

## Troubleshooting

**`./bin/check-env: No such file or directory`**
Run `git submodule update --init`.

**WireGuard peers not connecting**
Check that the public IPs in `controlPlane:wgPeers` are correct. Verify UDP port 51821 is open in the security group. Run `sudo wg show` on both nodes to see handshake status.

**RDS connection refused**
The database security group only allows connections from the control-plane security group. Verify both are in the same VPC and the security group rules are correct.

**Certificate provisioning fails**
Certbot uses Route53 DNS challenge. Verify the Route53 zone ID is correct and the EC2 instance role has `route53:ChangeResourceRecordSets` permission.

**Deploy script fails with "stack not found"**
Set `PULUMI_STACKS` to match your stack name: `PULUMI_STACKS="test-1" ./deploy.sh`

## Configuration Reference

See `Pulumi.example.yaml` in each stack directory for all available configuration keys with descriptions.

## License

[LGPLv3](LICENSE)
