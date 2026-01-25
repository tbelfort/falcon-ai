# Agents Guide (falcon-ai)

This repository is a Node.js (>=20) + TypeScript project using native ESM (`"type": "module"`).
TypeScript is compiled with `moduleResolution: NodeNext`, so internal imports typically use `.js` extensions.

## Quick Commands

Install:

```bash
npm install
```

Build (emit to `dist/`):

```bash
npm run build
```

Build (watch):

```bash
npm run build -- --watch
```

Typecheck only (no emit):

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Note: `package.json` defines an ESLint script, but this repo currently does not pin `eslint` in `devDependencies`.
If linting fails with “command not found: eslint”, install + configure ESLint first, or rely on `typecheck` + tests.

Run tests (Vitest):

```bash
npm test        # vitest (watch / interactive)
npm run test:run # vitest run (CI-style)
```

Run a single test file:

```bash
npm test -- tests/injection/selector.test.ts
npm run test:run -- tests/injection/selector.test.ts
```

Run a single test by name (substring match):

```bash
npm test -- -t "prioritizes security"
npm run test:run -- -t "prioritizes security"
```

Run a single test file + name:

```bash
npm run test:run -- tests/injection/selector.test.ts -t "prioritizes security"
```

Coverage:

```bash
npx vitest run --coverage
```

## Local Runtime / CLI

This package builds a CLI at `dist/cli/index.js` and exposes `falcon` via `package.json#bin`.

Typical local flow:

```bash
npm run build
node dist/cli/index.js --help
```

Link globally (optional):

```bash
npm link
falcon --help
```

## PM API + DB Utilities

The PM subsystem is built output-first (scripts run `npm run build` then execute `dist/...`).

```bash
npm run pm:api:dev        # start server from dist
npm run pm:db:migrate     # run migrations
npm run pm:db:seed        # seed data
```

## Repo-Specific Rules (From Existing Docs)

- See `CLAUDE.md` for the multi-agent workflow and the “append-only history / deterministic over LLM judgment” principles.
- Avoid working directly on `main`; prefer feature branches (the project documents a Linear-driven workflow).
- After `falcon init`, `.falcon/` and parts of `.claude/` are intended to be local install artifacts (often gitignored).

No Cursor rules (`.cursor/rules/` or `.cursorrules`) and no Copilot instructions (`.github/copilot-instructions.md`) were found.

## Code Style Guidelines

### Language + Module Conventions

- Use TypeScript everywhere; keep code `strict`-friendly.
- This is ESM + NodeNext: when importing project files, use `.js` in the import specifier.
  - Example: `import { getDatabase } from '../storage/db.js';`
- Prefer `import type { ... }` for type-only imports.
- Prefer named exports; only use default exports where already established (e.g. config files).

### Formatting

- Indentation: 2 spaces.
- Quotes: single quotes.
- Semicolons: yes.
- Trailing commas: common in multiline literals.
- Keep long argument lists / object literals wrapped and readable.

### Imports

Aim for simple, readable grouping (don’t churn existing files just to reorder imports):

1) Node built-ins (e.g. `fs`, `path`, `crypto`)
2) External packages (e.g. `express`, `zod`, `better-sqlite3`)
3) Internal modules (`../...`)
4) `import type` lines can live near the corresponding value imports.

### Types

- Model domain data with explicit types.
- When validating external input (HTTP, config, file content), validate at the boundary:
  - Config: Zod schema + `safeParse` (see `src/config/loader.ts`).
  - Contracts/schemas: Zod schemas in `src/schemas/index.ts`.
- Prefer discriminated unions / tagged unions where they remove ambiguity.

### Naming

- `camelCase`: variables, functions, methods.
- `PascalCase`: classes, types, interfaces.
- `SCREAMING_SNAKE_CASE`: constants.
- Files: kebab-case (common across `src/`).
- Tests: `tests/**/**.test.ts`.

### Error Handling

- Service layer (PM API) often uses a Result union: `{ ok: true, value } | { ok: false, error }`.
  - Prefer returning typed error objects over throwing for expected failures.
  - Map error codes to HTTP status via `src/pm/api/http-errors.ts`.
- API routes should:
  - return `{ data: ... }` on success
  - return `{ error: { code, message, details? } }` on handled failures
  - fall back to `500` with `INTERNAL_ERROR` on unexpected exceptions.
- CLI commands:
  - print user-facing errors with `console.error('Error:', message)`
  - use `process.exit(1)` for fatal errors
  - add extra confirmation and defense-in-depth for destructive actions (see `src/cli/commands/delete.ts`).

### Database + Security

- SQLite access uses `better-sqlite3` in core storage; prefer parameterized statements (`?`) over string interpolation.
- Validate and sanitize user-controlled strings (especially in CLI) before using them in file paths, SQL, or shell.
- When deleting or mutating large sets of records, wrap in transactions for atomicity.

### Tests

- Use Vitest (`describe/it/expect`) and keep tests hermetic.
- Prefer in-memory SQLite (`new Database(':memory:')`) for repo/service tests and run migrations via `initializeDatabase`.
- Tests commonly import from `src/` using `.js` extensions (mirrors runtime ESM output).
