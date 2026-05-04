# Local Docker Stack Skill

Use this guide when onboarding an engineer or agent to run the Marketplace
Docker Compose stack locally.

## Purpose

This stack runs a production-like local Marketplace environment with Postgres,
the control-plane API, discovery API, control-plane UI, two local OpenResty API
nodes, the local sidecar, the real Faremeter facilitator app, and a local
publisher mock.

## Required Setup

Initialize submodules before using the local Make targets:

```bash
git submodule update --init --recursive
```

Create or provide the local payment keypair:

```bash
mkdir -p keypairs
solana-keygen new --outfile keypairs/facilitator.json
```

`LOCAL_SERVICE_SOLANA_ADDRESS` is optional. If unset, the seed script derives
the receiver wallet address from `keypairs/facilitator.json`.

## Required Folder Layout

The Compose file mounts this checkout directly as `/workspace/marketplace`, so
the local marketplace directory can have any name. It also mounts the Faremeter
checkout as `/workspace/faremeter`.

By default, Compose looks for Faremeter at `../faremeter`:

```text
fare/
  faremeter/
    apps/
      facilitator/
      sidecar/
  faremeter-marketplace/
    compose.yml
```

If Faremeter lives somewhere else, pass an explicit path:

```bash
FAREMETER_REPO_PATH=/absolute/path/to/faremeter make local-up
FAREMETER_REPO_PATH=/absolute/path/to/faremeter make local-check
```

Use a real checkout path for `FAREMETER_REPO_PATH`; Docker Desktop on macOS may
not resolve symlinks that point outside a bind mount.

From this repo, verify:

```bash
pwd
test -f package.json
test -d "${FAREMETER_REPO_PATH:-../faremeter}/apps/facilitator"
test -d "${FAREMETER_REPO_PATH:-../faremeter}/apps/sidecar"
git -C "${FAREMETER_REPO_PATH:-../faremeter}" remote -v
```

The expected upstream for the sibling repo is:

```text
https://github.com/faremeter/faremeter.git
```

## Run The Stack

From `marketplace`:

```bash
make local-up
```

Equivalent raw Compose command:

```bash
docker compose up --build -d
```

`make local-up` starts the Compose graph and seeds local data through the
`seed-local-dev` service.

Use `make local-seed` only when reseeding an already-running stack during
debugging.

Run the local stack checks:

```bash
make local-check
```

The local check:

- waits for control-plane, discovery, UI, and both API nodes
- logs in as the local admin
- finds the seeded demo tenant
- creates a new free endpoint through the control plane
- verifies unpaid requests return `402`
- routes the free endpoint through both API nodes
- verifies control-plane transaction and analytics records

## Agent Checklist

Before declaring the local Docker stack ready:

1. Verify the `infra-toolbox` submodule is initialized.
2. Verify the Faremeter checkout exists at `../faremeter` or
   `FAREMETER_REPO_PATH`.
3. Verify `keypairs/facilitator.json` exists or
   `LOCAL_SERVICE_SOLANA_ADDRESS` is set.
4. Run `make local-up`.
5. Run `make local-check`.
6. If either command fails, report the failing command and relevant service logs.
