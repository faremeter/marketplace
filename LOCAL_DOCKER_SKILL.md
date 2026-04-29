# Local Docker Stack Skill

Use this guide when onboarding an engineer or agent to run the Marketplace
Docker Compose stack locally.

## Purpose

This stack runs a production-like local Marketplace environment:

- PostgreSQL
- control-plane API
- discovery API
- control-plane UI
- two local OpenResty API nodes
- marketplace sidecar wrapper
- real Faremeter sidecar package
- real Faremeter facilitator app
- local publisher mock

## Required Folder Layout

The stack expects `marketplace` and `faremeter` to be sibling checkouts.
Compose does not clone `faremeter` for you.

```text
fare/
  faremeter/
    apps/
      facilitator/
      sidecar/
  marketplace/
    compose.yml
```

From this repo, verify:

```bash
pwd
test -d ../faremeter/apps/facilitator
test -d ../faremeter/apps/sidecar
git -C ../faremeter remote -v
```

The expected upstream for the sibling repo is:

```text
https://github.com/faremeter/faremeter.git
```

## What Runs From Where

The facilitator service runs the real app from the sibling repo:

```text
../faremeter/apps/facilitator
```

Inside Compose, it runs at:

```text
http://facilitator:4021
```

The sidecar service entrypoint is the Marketplace wrapper:

```text
apps/api-node-stack/sidecar/src/main.ts
```

That wrapper imports the reusable sidecar implementation from the sibling
`faremeter` repo through `@faremeter/sidecar`.

```text
../faremeter/apps/sidecar
```

Inside Compose, OpenResty talks to the sidecar at:

```text
http://api-node-sidecar:4002
```

## Required Local Keypair

Create a local Solana keypair before starting the stack:

```bash
mkdir -p keypairs
solana-keygen new --outfile keypairs/facilitator.json
```

The facilitator keypair is used by the facilitator service:

```text
keypairs/facilitator.json
```

The local check does not submit paid Solana transactions. It verifies that paid
routes return `402` with Solana devnet USDC requirements, then exercises free
proxy routing through both local API nodes.

The stack defaults to Solana devnet:

```text
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Start The Stack

From `marketplace`:

```bash
make local-up
```

Equivalent raw Compose command:

```bash
docker compose up --build -d
```

The first run installs dependencies in both sibling workspaces, builds the
`faremeter` workspace, migrates the control-plane database, and starts the
services. The facilitator, control-plane, seed script, and local check all use
Solana devnet by default.

## Seed Local Data

Seed the local admin user, nodes, wallet, tenant, endpoint, token price, and
node configs:

```bash
make local-seed
```

Local admin credentials:

```text
admin@local.faremeter.test
localdev123
```

## Useful URLs

```text
Control plane API: http://localhost:11337
Control plane UI:  http://localhost:11338
Discovery API:     http://localhost:11339
API node A:        http://localhost:18080
API node B:        http://localhost:18081
```

Seeded demo proxy URLs:

```text
http://demo-api.local.proxy.localhost:18080/v1/chat/completions
http://demo-api.local.proxy.localhost:18081/v1/chat/completions
```

## Run Local Checks

Run the local stack checks:

```bash
make local-check
```

The local check:

- waits for control-plane, discovery, UI, and both API nodes
- logs in as the local admin
- finds the seeded demo tenant
- creates a new free endpoint through the control plane
- verifies unpaid requests return `402` with devnet USDC payment requirements
- routes the free endpoint through both API nodes
- verifies control-plane transaction and analytics records

## Logs And Lifecycle

Follow logs:

```bash
make local-logs
```

Show service status:

```bash
make local-ps
```

Rebuild and recreate services:

```bash
make local-restart
```

Stop and remove local volumes:

```bash
make local-down
```

Reinstall workspace dependencies in the Docker volumes:

```bash
make local-reinstall
```

## Port Overrides

If default ports collide with another local stack:

```bash
MARKETPLACE_CONTROL_PLANE_PORT=1337 \
MARKETPLACE_UI_PORT=1338 \
MARKETPLACE_DISCOVERY_PORT=1339 \
MARKETPLACE_PROXY_PORT=8080 \
MARKETPLACE_PROXY_PORT_B=8081 \
MARKETPLACE_POSTGRES_PORT=5433 \
docker compose up --build -d
```

Proxy port overrides affect browser-facing URLs and the advertised proxy
resource URLs. The local check runs inside Compose and reaches API nodes by
service name while sending the seeded proxy host in the `Host` header.

## Troubleshooting

If `workspace-init` fails with a missing sibling checkout error, clone or place
the `faremeter` repo next to `marketplace`.

If payment requests fail with insufficient funds, run:

```bash
make local-check
```

Then fund the addresses printed by the preflight.

If the UI build does not pick up changed public env vars, recreate the UI
service:

```bash
docker compose up --build --force-recreate control-plane-ui
```

If API nodes do not pick up tenant config, reseed and inspect node logs:

```bash
make local-seed
docker compose logs api-node-a api-node-b api-node-sidecar
```

## Agent Review Checklist

Before declaring the Docker stack ready:

1. Verify `../faremeter/apps/facilitator` exists.
2. Verify `../faremeter/apps/sidecar` exists.
3. Verify keypairs exist under `keypairs/`.
4. Run `make local-up`.
5. Run `make local-seed`.
6. Run `make local-check`.
7. Fund wallets if needed.
8. Report any failing command with the relevant service logs.
