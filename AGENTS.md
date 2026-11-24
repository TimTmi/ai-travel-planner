# AGENTS.md

Project rules for AI coding assistants working on **AI Travel Planner**. `CLAUDE.md` imports this file; `.claude/settings.json` enforces the permission tiers below for Claude Code.

## Stack

- **Monorepo:** `pnpm` workspaces (`pnpm@12.21.0`, Node.js `>=22.12`). Install pnpm via `npm install -g pnpm` — do not use `corepack enable`, which is no longer bundled with Node 25+ (`AI-LOG.md`, 2026-11-20).
- **Frontend (`apps/web`):** Next.js 16 + TypeScript `6.0.3` + Vitest. Holds no secrets and makes no model calls.
- **Backend (`apps/api`):** NestJS 12 + TypeScript `6.0.3` + Prisma `7.10.1` (`@prisma/adapter-pg`) + PostgreSQL 18 + Vitest (`unplugin-swc`).
- **Sign-in:** Supabase Auth (sign-in only). `apps/api` verifies JWTs against the project JWKS (`SUPABASE_URL`) and reads the caller id from `sub`. All application tables live in PostgreSQL through Prisma.
- **Model & media:** Fireworks AI (`accounts/fireworks/models/glm-5p3-flash`, called only from `apps/api` via `FIREWORKS_API_KEY`) and Cloudinary (backend-signed uploads).

## Commands

Run from the repository root (CI runs the exact same commands):

| Task                  | Command                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Lint (zero warnings)  | `pnpm lint`                                                                                         |
| Format / check        | `pnpm format` / `pnpm format:check`                                                                 |
| Type check            | `pnpm typecheck`                                                                                    |
| Unit tests (no DB)    | `pnpm test`                                                                                         |
| Contract tests (DB)   | `pnpm test:contract`                                                                                |
| Secret scan (history) | `docker run --rm -v "$PWD:/repo:ro" ghcr.io/gitleaks/gitleaks:v8.29.0 git /repo --redact --verbose` |
| Local PostgreSQL      | `docker compose up -d db`                                                                           |
| Apply migrations      | `pnpm db:migrate`                                                                                   |
| Dev servers           | `pnpm dev`                                                                                          |

## Conventions

- **PR workflow:** Every change goes through a PR into `main` (merge commits only; never push directly to, rebase, or force-push `main`).
- **Contract-first API:** `docs/contract/*.md` is the source of truth. If code and contract disagree, the code is wrong. Contract changes belong in a separate commit that states why — never in the same commit as code or tests.
- **Problem details (RFC 9457):** Every `/v1` 4xx/5xx response uses `application/problem+json` via `ProblemException` and `ProblemDetailsFilter`. Never leak stack traces, SQL, table names, file paths, or tokens in `detail`.
- **Body reading order:** Keep `APP_OPTIONS = { bodyParser: false }` shared by `main.ts` and `test/helpers/test-app.ts`, and read JSON bodies via `readJsonBody(req)` (16 KB cap) _after_ auth and ownership checks so `401 → 404 → 403 → invalid-json → validation` holds (commit `42270d4`).
- **Data types:** Money is integer VND (`BigInt` in Prisma/PostgreSQL, JS `number` `<= Number.MAX_SAFE_INTEGER` in JSON); ids are UUIDs; timestamps are ISO 8601 UTC.
- **Environment variables:** One root `.env` serves `apps/api`, Prisma, and `apps/web` (`next.config.ts`). Every variable read from `process.env` must be listed empty in `.env.example` so `apps/web/test/no-server-secrets.test.ts` guards all non-`NEXT_PUBLIC_` names (commit `dd0de25`, `AI-LOG.md` 2026-11-20).
- **Version pins:** Keep TypeScript on `6.0.3` (`typescript-eslint` rejects TS 7) and Prisma on stable `7.10.1` (`AI-LOG.md`, 2026-11-20).

## Never

- **Never put secrets in `apps/web`:** No `FIREWORKS_API_KEY`, `CLOUDINARY_*`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_JSON`, or any non-`NEXT_PUBLIC_` variable in `apps/web/src` or the browser bundle.
- **Never call real external services in tests:** `pnpm test` needs no DB and makes no LLM calls; `pnpm test:contract` signs local ES256 JWTs (`SUPABASE_JWKS_JSON`) and never calls live Supabase or Fireworks.
- **Never break AI Travel Planner's fixed rules (brief section 3):**
  - Never let the model read the database directly or calculate money — it reaches data only through the 7 backend JSON tools (`get_profile`, `search_places`, `get_menu`, `get_travel_time`, `get_weather`, `compute_cost`, `validate_plan`), and code calculates all costs.
  - Never send PII (user names, emails, account IDs) to the model — only checked place data and planning interests.
  - Never skip schema validation before the validator, bypass the backend validator, remove the two user confirmations, or share a plan with a group before Save.
  - Never relax the agent limits (2 repair rounds, 12 tool calls, 90 seconds), turn the product into a free-form chatbot, call a live places API while planning, or let promotional posts influence schedules.
- **Never game a check:** Never edit a test, contract, eval dataset, or validator rule just to make a failing check pass.
- **Never repeat known repo pitfalls:**
  - Never add a `.swcrc` that emits CommonJS — it breaks Vitest loading (`AI-LOG.md`, 2026-11-20).
  - Never drop `--max-warnings 0` from ESLint (`AI-LOG.md`, 2026-11-20).
  - Never re-enable Nest's global `bodyParser` — middleware parsing breaks contract check ordering (commit `42270d4`).
  - Never import directly from transitive packages like `'express'` in `apps/api` — pnpm's strict `node_modules` fails typecheck and lint (`AI-LOG.md`, 2026-11-22, commit `35d4c98`).
  - Never put `Read(.env.*)` in `.claude/settings.json` `deny` — `deny` overrides `allow` and would block reading `.env.example` (`AI-LOG.md`, 2026-11-24, commit `8f0923b`).
  - Never change the `Gitleaks` CI job to a shallow checkout or PR-only scan — keep `fetch-depth: 0` with `gitleaks git /repo --redact` so every run verifies the full git history (`AI-LOG.md`, 2026-11-24, commit `08dde18`).
  - Never commit `.env`, keys, or `.claude/settings.local.json`.

## Permissions

| Tier          | Scope                                                                                                                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Allowed**   | Read repo files (except secrets), read `.env.example`, edit code/tests/docs on feature branches, run `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:contract`, and read-only git (`status`, `diff`, `log`, `branch`).                                     |
| **Ask first** | `git commit`, `git push`, `git checkout`/`switch`, opening or merging PRs, adding/removing/upgrading dependencies (`pnpm add`/`remove`/`install`), running `pnpm db:migrate` or `docker compose`, and editing `docs/contract/**`, `.github/**`, `AGENTS.md`, `CLAUDE.md`, or `.claude/settings.json`. |
| **Never**     | Reading, editing, or printing `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`; pushing directly to or force-pushing/rebasing `main`; `git reset --hard`; destructive shell commands (`rm -rf`); weakening tests, contracts, or validator rules to pass CI.                                 |
