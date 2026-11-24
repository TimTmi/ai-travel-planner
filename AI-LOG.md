# AI-LOG.md

An account of where an AI assistant did part of the work on AI Travel Planner, and what we kept, changed and rejected. One file covers every milestone (PA#2 to PA#5), and we add entries as we go.

## Tools

| Tool                          | Used for                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Claude Code (Claude Opus 5.5) | Reading the brief and the rubric, the README, the scaffold/CI, A1, B1 review  |
| Antigravity                   | B1 API harness (Prisma schema, Supabase auth guard, problem filter), B2 rules |

## The LLM feature in our product

- **Model:** GLM 5.3 Flash (`accounts/fireworks/models/glm-5p3-flash`) on Fireworks AI serverless. It is called only from the backend (`apps/api`).
- **Cost of one plan:** _TBD_, to be measured on the dev set (working estimate about $0.01).
- **Spending cap:** a 25 USD usage limit on the Fireworks account. Fireworks cannot cap a single API key, so the account limit is the cap.
- **What data leaves our system:** the checked place data (names, types, hours, menu items and prices), the travel-time matrix, the weather and holidays, and members' interests. No user names, email addresses or account IDs are sent to the model. This is acceptable because all of it is either public place data or interests the user entered for planning, and none of it identifies a person.

## Entries

## 2026-11-20 — README

Tool: Claude Code.
Asked for: a README that covers what the brief and the PA#2 rubric require.
Kept: the structure, the one-command-per-check table, the fixed rules from section 3 of the brief, and the OpenStreetMap / Wikimedia / Open-Meteo credits.
Changed: the setup said `corepack enable`, but corepack is no longer bundled with Node 25+ and was missing on our machine, so it now says `npm install -g pnpm`. The spending cap first said "10 USD on the API key", but Fireworks has no per-key limit, so it now names the 25 USD account limit we actually set.
Rejected: the dev-server ports and the contract-test folder path. Both were guesses about code that does not exist yet, so we removed them before they could go stale. We also removed the link to the class brief, because we keep course documents out of the public repo.
By hand: the model and provider choice, the spending limit in the Fireworks dashboard, and the repo URL.

## 2026-11-20 — package manager

Tool: Claude Code.
Asked for: what pnpm is, and whether we should use it over npm.
Kept: pnpm workspaces for `apps/web` and `apps/api`, with one root command per check. Strict dependencies catch an undeclared import locally instead of in CI.
Changed: nothing.
Rejected: nothing.
By hand: the decision, agreed between both team members.

## 2026-11-20 — workspace scaffold and CI (P0)

Tool: Claude Code.
Asked for: the pnpm workspace with `apps/api` (NestJS, Prisma) and `apps/web` (Next.js), one root command per check, and a CI workflow that runs the same commands.
Kept: one CI job per check, so each shows as its own required status; a Vitest unit test and a contract test that boots the real API against PostgreSQL; a web test that fails if `apps/web/src` names any non-`NEXT_PUBLIC_` variable from `.env.example`, which is how "no model key in the browser bundle" is checked from now on.
Changed: npm's `latest` tag pointed at TypeScript 7.0, but typescript-eslint supports only `<6.1`, so TypeScript is pinned to 6.0.3. Prisma's `latest` tag was a release candidate (8.0.0-rc.34), so Prisma is pinned to the stable 7.10.1. A `.swcrc` written for the Nest build made the test transform emit CommonJS, and Vitest refused to load (`Vitest cannot be imported in a CommonJS module`); the file was removed and the test config sets ES module output. `eslint .` passed with a warning, so both apps now lint with `--max-warnings 0`.
Rejected: allowing every dependency's install script. pnpm blocks them by default, and only `prisma`, `@prisma/engines` and `@swc/core` are allowed, in `pnpm-workspace.yaml`.
Checked: each of the five checks was broken on purpose once (an `any`, bad spacing, a wrong return type, a removed database call, a wrong database password) and each went red; the web secret test went red when `page.tsx` read `FIREWORKS_API_KEY`.

## 2026-11-20 — sign-in with Supabase Auth

Tool: Claude Code.
Asked for: whether Supabase Auth (for sign-in only, Prisma for everything else) is a good choice, whether we still need a JWT secret, and what to change.
Kept: Supabase issues the tokens and `apps/api` verifies them against the project's JWKS (signature, issuer, audience `authenticated`, expiry), with the user id taken from `sub`. No `JWT_SECRET`, and no Supabase secret key in the API. `.env.example` gains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the web app and `SUPABASE_URL` for the API.
Changed: the web secret test matched names with `includes`, so the server-only `SUPABASE_URL` would have flagged a correct read of `NEXT_PUBLIC_SUPABASE_URL`. It now matches whole names; a probe page reading `NEXT_PUBLIC_SUPABASE_URL` passed and one reading `SUPABASE_URL` failed. Next.js reads `.env` only from `apps/web`, so `next.config.ts` now loads the root `.env`, as the API and Prisma already do; a probe build inlined a value from the root file into a client chunk.
Rejected: adding the auth guard and the Supabase client libraries now. Nothing calls them yet, so they come with the first protected endpoint, where contract tests will sign their own tokens with a local key pair instead of calling Supabase.
By hand: the choice of Supabase Auth. Still to watch: Supabase's built-in email only reaches the project's team members, so the public deployment needs our own SMTP or Google sign-in; free projects pause after a week without activity.

## 2026-11-21 — spending-cap contract (A1)

Tool: Claude Code.
Asked for: `docs/contract/spending-cap.md` for `PUT /v1/groups/{groupId}/members/{userId}/spending-cap`, modelled on the course's example contract, covering what our PA#2 plan lists: who may call it, the request and response, every problem type, idempotency, and what happens to a saved plan the new cap no longer fits.
Kept: the sections of the example contract; the ownership table (401, then 404 for a non-member so the group's existence is not revealed, then 403 for another member's cap); the order of checks; `null` removes the cap; saved plans that no longer fit are flagged `needsReview` and listed in `affectedPlans` but never edited; the endpoint never clears the flag; PUT with the same body returns the same body, `updatedAt` included. We also replaced the README's contract TODO with the link.
Changed: the assistant first called "every member within the lowest cap in the group" its own reading of the brief and an open question. The PA#3 rubric says the validator follows `eval.mjs` with exactly that rule, so it is the graded rule, not an interpretation. The draft also said a member with no cap is held only to the group total, which contradicts that rule: they are still held to the lowest cap the others set. We fixed the sentence.
Rejected: nothing in this draft. We weighed whether the lowest-cap rule is realistic (people order different dishes) and kept it, because it is the rule the grader scores.
By hand: reviewing and confirming the seven choices the brief leaves open (UUID ids, `null`, the 0 to `totalVnd` range, which plans count as affected, never clearing the flag, check order, no `If-Match`). Still to check: whether `eval.mjs` ignores members with no cap when it finds the lowest cap, once `travel-eval/README.md` is published.

## 2026-11-22 — API harness, Prisma schema, and Supabase auth guard (B1)

Tool: Antigravity (initial B1 implementation), Claude Code (review and body-reading follow-up).
Asked for: minimal Prisma models (`User`, `Group`, `GroupMember`, `Plan`) with migration, a Supabase JWT auth guard verifiable offline in tests, a global RFC 9457 `application/problem+json` exception filter, and a contract-test harness (`createTestApp`, `resetDatabase`, local ES256 key signing).
Kept: `BigInt` for VND money columns (`totalVnd`, `capVnd`, `highestMemberSpendVnd`) so values up to `Number.MAX_SAFE_INTEGER` do not overflow PostgreSQL `int4`; `GroupMember.updatedAt` without `@updatedAt` so idempotent PUTs keep the timestamp unchanged; `jose` with lazy JWKS lookup (remote via `SUPABASE_URL`, local override via `SUPABASE_JWKS_JSON` in tests) and `requiredClaims: ['exp', 'sub']`; `ProblemException` and `ProblemDetailsFilter` registered via `APP_FILTER` with `WWW-Authenticate: Bearer` on 401; `createTestApp()` and `createLocalAuthEnv()` test helpers.
Changed: the first draft imported `Request` and `Response` directly from `'express'`, which failed `tsc` and ESLint under pnpm's strict `node_modules` because `@types/express` is transitive; we replaced them with minimal structural interfaces instead of adding another dependency. Peer review of PR #3 then caught two real gaps before A2: `SUPABASE_JWKS_JSON` was read in `SupabaseAuthService` but missing from `.env.example` (fixed in commit `dd0de25`, now covered by `no-server-secrets`), and Nest's default Express `bodyParser` ran before guards, returning `400 invalid-json` on a malformed body with no token instead of `401` (fixed in commit `42270d4` by sharing `APP_OPTIONS = { bodyParser: false }` between `main.ts` and `test-app.ts` and reading JSON bodies via `readJsonBody(req)` with a 16 KB cap, paired with contract commit `a77f5a0`).
Rejected: leaving `SUPABASE_JWKS_JSON` out of `.env.example` as a test-only variable — every `process.env` variable must appear in `.env.example` so `no-server-secrets` guards it. Also rejected keeping the `entity.parse.failed` branch in `ProblemDetailsFilter` once global `bodyParser` was turned off.
By hand: local Docker PostgreSQL `.env` setup, reviewing the PR across both teammates, and deciding to disable global `bodyParser` so runtime and test check order match the contract.

## 2026-11-24 — rules file and assistant permissions (B2)

Tool: Antigravity.
Asked for: a rules file and three-tier permissions setup for PA#2 (B2) that works for both Antigravity and Claude Code without duplicating rules across two files.
Kept: `AGENTS.md` as the single source of truth (Stack, Commands, Conventions, Never tied to brief section 3 and traceable repo incidents, plus the 3-tier Permissions table); `CLAUDE.md` containing only `@AGENTS.md` so Claude Code imports it without drift; `.claude/settings.json` enforcing `allow`, `ask`, and `deny` for Claude Code; updated `README.md` to reference all three files.
Changed: instead of putting `Read(.env.*)` in `.claude/settings.json`'s `deny` list, we denied explicit secret patterns (`.env`, `.env.local`, `.env.development*`, `.env.production*`, `.env.test*`, `*.pem`, `*.key`) because Claude Code's `deny` overrides `allow` and `.env.*` would have blocked reading `.env.example`. We also included the repo's real incidents (`.swcrc`, TS 6.0.3 / Prisma 7.10.1 pins, `--max-warnings 0`, `bodyParser: false`, `SUPABASE_JWKS_JSON`) directly in `AGENTS.md` during B2 rather than waiting until B4.
Rejected: duplicating the full rules in both `AGENTS.md` and `CLAUDE.md`, and creating a separate JSON permission file for Antigravity (which reads `AGENTS.md` directly and prompts for approvals in its UI).
By hand: agreeing between both teammates on the single-source-of-truth layout (`AGENTS.md` + `CLAUDE.md` + `.claude/settings.json`), choosing English to match the repository, and reviewing the permission tiers before committing.
