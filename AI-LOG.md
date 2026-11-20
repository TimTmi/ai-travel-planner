# AI-LOG.md

An account of where an AI assistant did part of the work on AI Travel Planner, and what we kept, changed and rejected. One file covers every milestone (PA#2 to PA#5), and we add entries as we go.

## Tools

| Tool | Used for |
| ---- | -------- |
| Claude Code (Claude Opus 5.5) | Reading the brief and the rubric, the README, the harness setup |

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
