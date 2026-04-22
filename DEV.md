# Developer Notes

## Tools Required

- node (v22 or newer)
- pnpm
- bash (v4 or newer)
- GNU make
- opsh

Note: A recent version of `opsh` is included in the repository under `bin/`. You can set your `PATH` to include `bin/` to use that version rather than install it directly.

## Setting Up Your Environment

0. Initialize the submodule:

```
git submodule update --init
```

1. Configure your git hooks:

```
git config core.hooksPath .githooks
```

2. Install all of the needed packages:

```
pnpm install
```

If `make` fails with `./bin/check-env: No such file or directory`, the submodule was not initialized. Run `git submodule update --init` again and verify `ls infra-toolbox/` shows files.

## Building

Build everything (lint, compile, test):

```
make
```

Build only (TypeScript compilation):

```
make build
```

Build a specific app (faster during development):

```
make apps/control-plane
make apps/discovery
make apps/api-node-stack
make apps/control-plane-stack
make apps/database-stack
make apps/vpc-stack
```

## Testing

### Running Unit Tests

```
make test
```

### Running Integration Tests

The `tests/` directory contains integration tests that exercise the gateway nginx prototype with real HTTP servers:

```
cd tests && pnpm test
```

There is also a standalone prototype test that can be run directly:

```
cd tests && pnpm test:prototype
```

## Linting and Formatting

Check formatting and lint:

```
make lint
```

Auto-format with Prettier:

```
make format
```
