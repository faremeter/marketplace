# Code Conventions

This document describes the coding conventions, patterns, and best practices used in this codebase. Follow these guidelines when contributing to ensure consistency across the project.

## Table of Contents

- [Monorepo Structure](#monorepo-structure)
- [Build and Development Commands](#build-and-development-commands)
- [Quick Reference](#quick-reference)
- [Philosophy](#philosophy)
- [TypeScript Configuration](#typescript-configuration)
- [Code Formatting](#code-formatting)
- [Naming Conventions](#naming-conventions)
- [Type System Patterns](#type-system-patterns)
- [Import/Export Patterns](#importexport-patterns)
- [Error Handling](#error-handling)
- [Async Patterns](#async-patterns)
- [Module Organization](#module-organization)
- [Testing](#testing)
- [Logging](#logging)
- [Documentation](#documentation)

---

## Monorepo Structure

This is a pnpm monorepo. Internal packages use the `@1click/` namespace.

- **Applications** go in `apps/`
- **Shared libraries** go in `packages/` (namespace: `@1click/<name>`)
- **Integration tests** go in `tests/`
- **Shared infrastructure config** lives in `infra-toolbox/` (git submodule)
- **Shell helpers** live in `lib/` (symlinked from `infra-toolbox/`)

Several root-level config files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.ts`, `.githooks`) are symlinks into `infra-toolbox/`. The submodule must be initialized for anything to work.

Do not create standalone TypeScript files in the repository root.

**Note:** `apps/control-plane-ui` is excluded from the default `make` build due to a pre-existing dependency resolution issue. It must be built separately.

---

## Build and Development Commands

```bash
# Full build pipeline
make

# Individual commands
make build    # Compile TypeScript
make lint     # Run Prettier + ESLint checks
make test     # Run tap tests
make format   # Auto-format with Prettier
make clean    # Remove dist directories
```

See [DEV.md](./DEV.md) for complete development setup instructions.

### pnpm Catalog

Dependencies are managed via the pnpm catalog defined in `pnpm-workspace.yaml`. When adding a new dependency, add its version to the `catalog:` section and reference it with `catalog:` in `package.json`:

```json
{
  "dependencies": {
    "hono": "catalog:"
  }
}
```

This keeps all version pins in one place. Do not pin versions directly in individual `package.json` files unless there is a specific reason to diverge.

---

## Quick Reference

### Do

- Always do a full build using `make` before considering your changes are correct/committing
- Use `arktype` for runtime validation
- Use `import type` for type-only imports
- Create factory functions with `create*` prefix
- Return `null` from handlers when request doesn't match
- Use `{ cause }` when re-throwing errors
- Use the package logger, never `console`
- Co-locate tests with source files
- Run `make format` before committing
- Let TypeScript infer types when obvious

### Don't

- Mix refactors/whitespace changes with functional changes.
- Use `console.log` (use logger)
- Use default exports
- Create classes unless necessary (prefer factory functions)
- Ignore validation errors (always check with `isValidationError`)
- Use `any` type (use `unknown` and narrow)
- Use type assertions (`as Type`) - they indicate interface problems
- Skip runtime validation in favor of type assertions (use arktype)
- Commit without running `make lint`
- Over-type code with explicit annotations the compiler can infer

---

## Philosophy

This is a multi-tenant payment proxy for the x402 protocol. The codebase follows these core principles:

- **Operational simplicity** - Infrastructure should be straightforward to deploy, monitor, and debug
- **Tenant isolation** - Each tenant's configuration, routing, and payment handling is independent
- **Composability** - Components work together flexibly
- **Pragmatic** - Interface-driven design with loose coupling

Key design decisions:

- Prefer interfaces over concrete implementations
- Minimize dependencies between packages
- Lean on `@faremeter/*` packages for payment protocol logic rather than reimplementing it

---

## TypeScript Configuration

The project uses strict TypeScript settings defined in [`tsconfig.base.json`](./tsconfig.base.json). Key implications:

- **Strict mode enabled**: All strict type-checking options are active
- **`noUncheckedIndexedAccess`**: Array/object index access may return `undefined`. Always check before using.
- **`exactOptionalPropertyTypes`**: Optional properties cannot be explicitly set to `undefined`.
- **`verbatimModuleSyntax`**: Use `import type` for type-only imports.
- **ESNext target**: Modern JavaScript features are available; no need for polyfills.

---

## Code Formatting

Formatting is enforced via Prettier.

Key formatting rules:

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Double quotes `"` for strings
- **Semicolons**: Required
- **Trailing commas**: Always (including function parameters)

Run `make format` to auto-format all files.

---

## Naming Conventions

### Files

| Type                | Convention                        | Example                                 |
| ------------------- | --------------------------------- | --------------------------------------- |
| Regular modules     | Lowercase, hyphens for multi-word | `token-payment.ts`, `server-express.ts` |
| Single-word modules | Lowercase                         | `solana.ts`, `common.ts`, `index.ts`    |
| Test files          | `{name}.test.ts`                  | `cache.test.ts`, `facilitator.test.ts`  |

### Functions

| Pattern     | Use Case                       | Example                              |
| ----------- | ------------------------------ | ------------------------------------ |
| `camelCase` | All functions                  | `handleRequest`, `buildNodeConfig`   |
| `create*`   | Factory functions              | `createServer`, `createRouter`       |
| `is*`       | Boolean predicates             | `isValidationError`, `isActive`      |
| `get*`      | Retrieval without side effects | `getEndpoints`, `getTenant`          |
| `lookup*`   | Search/lookup operations       | `lookupTenant`, `lookupNode`         |
| `generate*` | Builder/generator functions    | `generateGatewaySpec`, `generateKey` |
| `handle*`   | Event/request handlers         | `handleSettle`, `handleVerify`       |

### Variables

| Pattern                | Use Case                    | Example                                      |
| ---------------------- | --------------------------- | -------------------------------------------- |
| `camelCase`            | Regular variables           | `paymentRequiredResponse`, `recentBlockhash` |
| `SCREAMING_SNAKE_CASE` | Constants, environment vars | `X402_EXACT_SCHEME`, `PAYER_KEYPAIR_PATH`    |
| `_` prefix             | Unused parameters           | `_ctx`, `_unused`                            |

### Acronyms in Names

When using acronyms in camelCase or PascalCase names, preserve the acronym's capitalization based on the position:

- **If the acronym starts with an uppercase letter**, keep it fully capitalized
- **If the acronym starts with a lowercase letter**, keep it fully lowercase

**Good:**

```typescript
function getURLFromRequestInfo(input: RequestInfo | URL): string { ... }
const requestURL = "https://example.com";
const parseHTTPHeaders = () => { ... };
```

**Bad:**

```typescript
function getUrlFromRequestInfo(input: RequestInfo | URL): string { ... }
const requestUrl = "...";
const HttpConnection = { ... };
```

**Common acronyms to watch:** URL, HTTP, HTTPS, JSON, API, RPC, HTML, XML

**Note:** "ID" is an abbreviation (not an acronym), so use standard camelCase rules: `userId`, `requestId`, `getId()`.

### Types and Interfaces

| Pattern           | Use Case                 | Example                               |
| ----------------- | ------------------------ | ------------------------------------- |
| `PascalCase`      | Interfaces, type aliases | `EndpointConfig`, `TenantRecord`      |
| `lowercase`       | Protocol-specific types  | `x402PaymentRequirements`             |
| `*Args` / `*Opts` | Function arguments       | `CreateServerOpts`, `BuildConfigArgs` |
| `*Response`       | API responses            | `HealthResponse`                      |
| `*Info`           | Data structures          | `NodeInfo`, `TenantInfo`              |
| `*Handler`        | Handler interfaces       | `RequestHandler`                      |

---

## Type System Patterns

### Runtime Validation with arktype

Use `arktype` for runtime type validation. Define the validator and TypeScript type together:

```typescript
import { type } from "arktype";

export const x402PaymentRequirements = type({
  scheme: "string",
  network: "string",
  maxAmountRequired: "string.numeric",
  resource: "string.url",
});

export type x402PaymentRequirements = typeof x402PaymentRequirements.infer;
```

### Type Guards

Create type guards using validation functions:

```typescript
import { isValidationError } from "@faremeter/types";

export function isAddress(maybe: unknown): maybe is Address {
  return !isValidationError(Address(maybe));
}
```

### Interfaces vs Types

- **`type`**: Use for data structures, unions, and arktype-derived types
- **`interface`**: Use for behavioral contracts (objects with methods)

### Const Assertions for Exhaustive Types

Use `as const` for exhaustive literal types:

```typescript
const PaymentMode = {
  ToSpec: "toSpec",
  SettlementAccount: "settlementAccount",
} as const;

type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];
```

### Type-Only Imports

Use `import type` for type-only imports (required by `verbatimModuleSyntax`):

```typescript
import type { x402PaymentRequirements } from "@faremeter/types/x402";

// Mixed imports
import {
  type Rpc,
  type Transaction,
  createTransactionMessage,
} from "@solana/kit";
```

### Avoid Over-Typing

Let TypeScript infer types when they are obvious. Do not add explicit type annotations that the compiler can easily infer.

**When to add explicit types:**

- Public API boundaries where the type serves as documentation
- When the inferred type would be too wide
- When TypeScript cannot infer the type correctly
- Complex return types that benefit from explicit documentation

**When NOT to add explicit types:**

- Variable assignments with obvious literal values
- Return types that match a simple expression
- Loop variables and intermediate calculations
- Arrow function parameters in callbacks where context provides types

### Generic Constraints vs Index Signatures

When creating extensible interfaces, prefer generic type parameters with constraints over index signatures.

### Avoiding `any` and Type Assertions

- Use `unknown` instead of `any` when the type is truly unknown
- Narrow `unknown` values using type guards or runtime validation
- Only use `any` when interfacing with poorly-typed third-party libraries where no better option exists
- Type assertions (`as Type`) usually indicate a problem with the interfaces being used

---

## Import/Export Patterns

### Barrel Exports

Use `index.ts` files to re-export from modules:

```typescript
export * as x402 from "./x402";
export * from "./validation";
```

### Named Exports (Preferred)

Prefer named exports over default exports:

```typescript
// Good
export function createMiddleware(args: CreateMiddlewareArgs) { ... }

// Avoid
export default function createMiddleware(args: CreateMiddlewareArgs) { ... }
```

### Import Ordering

Order imports by category:

1. External library imports
2. Internal package imports (`@1click/*`, `@faremeter/*`)
3. Relative imports

---

## Error Handling

### Validation Errors

Check arktype validation errors before proceeding:

```typescript
const paymentPayload = x402PaymentHeaderToPayload(paymentHeader);

if (isValidationError(paymentPayload)) {
  logger.debug(`couldn't validate client payload: ${paymentPayload.summary}`);
  return sendPaymentRequired();
}
```

### Error Chaining

Use `{ cause }` when re-throwing errors to preserve the error chain:

```typescript
try {
  transaction = paymentPayload.transaction;
} catch (cause) {
  throw new Error("Failed to get compiled transaction message", { cause });
}
```

### Return `null` for "Not My Responsibility"

Handlers should return `null` when a request doesn't match their criteria.

---

## Async Patterns

### Factory Functions

Use async factory functions that return objects with async methods:

```typescript
export const createFacilitatorHandler = async (
  network: string,
  rpc: Rpc<SolanaRpcApi>,
): Promise<FacilitatorHandler> => {
  const mintInfo = await fetchMint(rpc, address(mint.toBase58()));
  return { getSupported, getRequirements, handleVerify, handleSettle };
};
```

### Parallel Execution

Use `Promise.all` for independent parallel operations.

### Timeouts

Use `Promise.race` for operations that need timeouts.

---

## Module Organization

### Package Structure

Each package follows this structure:

```
packages/<name>/
├── package.json
├── src/
│   ├── index.ts         # Public exports (barrel file)
│   ├── internal.ts      # Internal utilities (optional)
│   ├── common.ts        # Shared logic
│   ├── *.test.ts        # Tests co-located with source
│   └── <feature>/       # Feature-specific subdirectories
```

Packages use the `@1click/` namespace (e.g., `@1click/db-schema`, `@1click/test-db`).

### Multiple Entry Points

Use `exports` in `package.json` for multiple entry points. This allows consumers to import specific submodules rather than the entire package.

---

## Testing

### Framework: node-tap

Tests use the `tap` framework with `@tapjs/tsx` for TypeScript support.

### Test File Structure

```typescript
#!/usr/bin/env pnpm tsx

import t from "tap";

await t.test("descriptiveTestName", async (t) => {
  const cache = new AgedLRUCache<string, number>({
    capacity: 3,
    maxAge: 1000,
  });

  t.equal(cache.size, 0);
  t.matchOnly(cache.get("key"), undefined);

  t.pass();
  t.end();
});
```

### Key Patterns

- Start test files with shebang: `#!/usr/bin/env pnpm tsx`
- Use `await t.test()` for async test suites
- Always call `t.end()` to complete tests
- Co-locate tests with source files (`*.test.ts`)

### Common Assertions

```typescript
t.equal(actual, expected); // Strict equality
t.matchOnly(actual, expected); // Deep/partial matching
t.match(actual, pattern); // Pattern matching
t.ok(condition); // Truthy
await t.rejects(asyncFn, expectedError);
```

### Test Coverage Philosophy

Focus test coverage on logic that is specific to this codebase:

- Business logic and domain-specific validation
- Integration points between components
- Error handling paths and edge cases
- Custom algorithms and data transformations

Do not write tests that merely verify functionality provided by external libraries. Trust well-maintained libraries to do their job.

---

## Logging

Applications use `@logtape/logtape` directly for logging. ESLint enforces `no-console: error`. Always use the package logger instead of `console.log`.

### Application Logger Setup

Each application creates its own logger in a dedicated `logger.ts` file:

```typescript
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
    {
      category: ["my-app"],
      sinks: ["console"],
      lowestLevel:
        (process.env.LOG_LEVEL as "debug" | "info" | "warning" | "error") ??
        "info",
    },
  ],
});

export const logger = getLogger(["my-app"]);
```

Note that `configure()` is async (top-level await), but `getLogger()` is synchronous.

### Log Levels

| Level     | Use Case                                      |
| --------- | --------------------------------------------- |
| `debug`   | Development information, detailed diagnostics |
| `info`    | General operational messages, status updates  |
| `warning` | Recoverable issues, degraded functionality    |
| `error`   | Failures that need attention                  |
| `fatal`   | Unrecoverable errors                          |

---

## Documentation

### Inline Comments

Use sparingly, prefer self-documenting code.

**When comments ARE useful:**

- Complex algorithms that aren't immediately obvious
- Non-obvious workarounds or edge cases
- TODO/FIXME/XXX markers for future work
- Business logic that requires explanation

Do not add comments that merely describe what the code obviously does. Decorative comment blocks (ASCII art dividers, section headers) add visual noise without providing meaningful information.

Do not reference external tracking artifacts in code comments. Comments like `// Issue 1: ...` or `// Fixes JIRA-1234` are meaningless to future readers. An exception is URLs that point at long-lived resources (RFCs, specification documents, upstream bug reports).

---

## ESLint Rules

ESLint is configured in `eslint.config.ts` (symlinked from `infra-toolbox/`) using TypeScript-ESLint's strict and stylistic rules.

Key rules:

- **No console**: `console.log` and similar are errors. Use the package logger instead.
- **Unused variables**: Must be prefixed with `_` (e.g., `_ctx`, `_unused`).
- **Type definitions**: Both `type` and `interface` are allowed. Choose based on the guidelines in [Interfaces vs Types](#interfaces-vs-types).

---

## Git Workflow

### Setup

Configure git hooks before making commits: `git config core.hooksPath .githooks`

### pnpm Artifacts

When a commit modifies any `package.json` file, the corresponding pnpm artifacts (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, etc.) must be included in the same commit.

### Commit Messages

- **Summary line**: Max 72 characters, non-empty
- **Blank line**: Required between summary and body (if body exists)
- **Body lines**: Max 72 characters each

Summary lines MUST be english sentences with no abbreviations, no markup (e.g. feat, chore), and not end with any punctuation. Commits messages should not be overly verbose. DO NOT include feature/change lists in the commit body; the code already shows this.

**Format:**

- Write concise messages (1-2 sentences) that explain why, not what
- Do not use bullet points or feature lists in commit messages
- Focus on the purpose and context of the change
- Do not include filenames in commit messages

**Good examples:**

```
Add retry logic for failed network requests

Fix race condition in transaction verification

Document individual package build targets
```

**Bad examples:**

```
feat: add retry logic
Update code
Fix bug in server.ts
```

The pre-commit hook automatically runs `make lint` on staged files. The `.githooks/` directory is a symlink into `infra-toolbox/` and requires the submodule to be initialized.
