# AI Travel Planner

A planner for a weekend in Ho Chi Minh City. An agent builds a day-by-day schedule and spending plan for one person or a group. It works only from checked place data, and a backend validator checks every plan before it can be shared.

This is the class project for CSC13114 (Advanced Web Application Development), class 2609-AWAD-23KTPM1.

## Team

| Student ID | Name           |
| ---------- | -------------- |
| 23127228   | Phạm Văn Minh  |
| 23127395   | Trần Anh Khoa  |

## Stack

| Layer          | Choice                         |
| -------------- | ------------------------------ |
| Frontend       | Next.js + TypeScript           |
| Backend        | NestJS + TypeScript            |
| Database       | PostgreSQL + Prisma            |
| Media storage  | Cloudinary                     |
| Monorepo       | pnpm workspaces                |

```
apps/web     Next.js frontend (holds no secrets and makes no model calls)
apps/api     NestJS backend (agent, tools, validator, Prisma)
docs/        endpoint contracts
```

## Getting started

Prerequisites: Node.js 22 or newer, pnpm (`npm install -g pnpm`), and Docker for the local PostgreSQL.

```bash
git clone https://github.com/TimTmi/ai-travel-planner.git
cd ai-travel-planner
pnpm install --frozen-lockfile

cp .env.example .env          # then fill in your own values; .env is git-ignored
docker compose up -d db       # local PostgreSQL
pnpm db:migrate               # apply Prisma migrations
pnpm dev                      # starts web and api
```

[`.env.example`](.env.example) lists every variable, with no values filled in. Never commit `.env`.

## Checks

Each check is one command. CI runs exactly these commands, in this order, on every pull request to `main`:

| Check           | Command              |
| --------------- | -------------------- |
| Lint            | `pnpm lint`          |
| Format check    | `pnpm format:check`  |
| Type check      | `pnpm typecheck`     |
| Tests           | `pnpm test`          |
| Contract tests  | `pnpm test:contract` |

`pnpm test` covers the unit tests, which never call a real model. `pnpm test:contract` needs the database from `docker compose up -d db`. To fix formatting locally, run `pnpm format`.

The CI workflow is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). `main` is protected: every check above must pass before a pull request can merge, and nobody pushes to `main` directly.

## Endpoint contract

The contract for our chosen endpoint lives in [`docs/contract/`](docs/contract/). It covers who may call the endpoint, the request and response shapes, every error as RFC 9457 problem details, and idempotency or paging. The contract tests (`pnpm test:contract`) hold the code to that file.

<!-- TODO: link the exact contract file once the endpoint is chosen -->

## The model and its cost

- **Model:** GLM 5.3 Flash (`accounts/fireworks/models/glm-5p3-flash`) on Fireworks AI serverless, called only from `apps/api` with `FIREWORKS_API_KEY`.
- **Price:** $0.15 per million input tokens and $0.50 per million output tokens (Fireworks list price, November 2026).
- **Cost of one plan:** _TBD_, to be measured on the dev set. Our working estimate is about $0.01: up to 12 tool calls, roughly 60k input tokens and 5k output tokens.
- **Spending cap:** the Fireworks account that owns `FIREWORKS_API_KEY` has a usage limit of 25 USD. Fireworks does not support a limit on a single key, so the cap is set on the account, and it covers every key on that account. When the limit is reached, Fireworks suspends the account and every call fails, so a runaway loop or a leaked key cannot cost more than 25 USD.

The same numbers are recorded in [`AI-LOG.md`](AI-LOG.md).

Rules the code enforces (fixed for every team by section 3 of the class brief):

- The model reaches data only through the seven backend tools. Money is calculated by code only.
- Model output is validated against a schema before the validator sees it.
- The validator runs in the backend, and both user confirmations stay. Nothing reaches the group before Save.
- Limits per plan: 2 repair rounds, 12 tool calls, 90 seconds.
- API keys stay in the backend and never reach the browser. Only places and interests go to the model, never names or email addresses.

## Working with an AI assistant

The rules our coding assistant follows, including its allowed / ask-first / never permissions, are in [`CLAUDE.md`](CLAUDE.md). What the assistant did, and what we changed or rejected, is logged in [`AI-LOG.md`](AI-LOG.md).

## Course submissions

| Checkpoint | File                                                           |
| ---------- | -------------------------------------------------------------- |
| PA#2       | [`PA2.md`](PA2.md), [`SELF_ASSESSMENT_REPORT.md`](SELF_ASSESSMENT_REPORT.md) |

## Product-owner decisions

Scope decisions from the product owners' post (`#AWAD23KTPM1` in the course Facebook group) that we rely on are listed here, each with a link to the answer.

_None yet._

## Data credits

Place data is the class's shared set, published by the product owners. Map data is from © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, photos are from [Wikimedia Commons](https://commons.wikimedia.org/), and weather is from [Open-Meteo](https://open-meteo.com/).
