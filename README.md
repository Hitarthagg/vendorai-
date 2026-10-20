# VendorMind

**Evidence-backed supplier comparison for bulk purchases, powered by TinyFish web research.**

VendorMind helps a buyer decide where to purchase supplies in bulk. It researches supplier pages on the web, compares the **known total cost** (not just the unit price), lets the buyer change one constraint and watch the winner change, and shows the evidence behind every number.

> **Status:** Round 1 prototype. Two categories use live research and one uses clearly labelled fixtures. See [Live vs Fixture Data](#live-vs-fixture-data) and [Known Limitations](#known-limitations).

- **Live demo:** `[Vercel URL]`
- **Demo video:** `[https://youtu.be/vFfuDrZakHo?si=ujsANCCRjzDvNxkJ]`
- **Hackathon:** `[Kritical Hacks]`

---

## Table of Contents

1. [The Problem](#the-problem)
2. [What VendorMind Does](#what-vendormind-does)
3. [How TinyFish Is Used](#how-tinyfish-is-used)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Repository Structure](#repository-structure)
7. [Data Model and Provenance](#data-model-and-provenance)
8. [Decision Engine](#decision-engine)
9. [API Reference](#api-reference)
10. [Engineering Rules](#engineering-rules)
11. [Live vs Fixture Data](#live-vs-fixture-data)
12. [Getting Started](#getting-started)
13. [Environment Variables](#environment-variables)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [Known Limitations](#known-limitations)
17. [Round 2 Roadmap](#round-2-roadmap)
18. [Team](#team)

---

## The Problem

When a business buys supplies in bulk, the lowest unit price is rarely the cheapest deal. Minimum order quantities (MOQ), shipping costs, extra fees, quantity discounts and delivery deadlines all change the real cost. Today, comparing suppliers means opening many tabs, copying numbers into a spreadsheet, and still not knowing how far each number can be trusted.

Supplier information is also locked inside messy, interactive web pages: prices that change with quantity tiers, shipping calculators, MOQ dropdowns. Clean APIs rarely exist.

## What VendorMind Does

1. **Purchase brief.** The buyer enters a product, quantity, budget, deadline, mandatory spec and priority.
2. **Live research.** TinyFish discovers candidate suppliers and reads their pages. Extracted fields are normalized into comparable offers.
3. **Known total cost.** The engine calculates `unit price x quantity + shipping + fees - applicable discounts` in plain TypeScript.
4. **Hard filters first.** Spec, MOQ and deadline are checked before any ranking. Missing data is shown as **unknown**, never as a pass.
5. **Explained ranking.** Offers are ranked with visible score components for cheapest, fastest or balanced priorities.
6. **Counterfactual sandbox.** The buyer moves sliders for quantity, discount, shipping and deadline. The ranking updates, a break-even point is marked, and the next-best fallback is shown.
7. **Evidence drawer.** Every important value opens its source URL, retrieval time and status badge.
8. **Negotiation draft.** A draft is written from verified facts only and checked for unsupported numbers. A human approves it. **The prototype never sends anything.**

## How TinyFish Is Used

TinyFish is the research layer of VendorMind. It runs as a **cost-ordered cascade**, so the cheapest working call is always tried first.

| Step | TinyFish API | Purpose | Notes |
|------|--------------|---------|-------|
| 1. Discover | **Search** | One query per brief (for example "food grade steel bottle bulk MOQ"). Keep the top results and shortlist 3 to 5 candidate suppliers. | Sites that forbid automation are dropped. |
| 2. Read | **Fetch** | Render each candidate page in a real browser and return clean content. An LLM extracts it into the Offer schema, and Zod validates it. | Handles most pages. |
| 3. Hard pages | **Agent** | Used only when Fetch leaves price, MOQ or shipping missing. A natural-language goal drives the browser (quantity tier, shipping calculator, MOQ dropdown). Progress streams to the UI over SSE. | Consumes credits, so runs are capped and logged. |

**Why this matters:** TinyFish turns interactive, messy supplier pages into structured offers without us building fragile per-site scrapers. The cascade keeps research fast and economical, because the Agent runs only where a page truly needs browser actions.

**Safeguards**
- Agent goals state exactly what to return and instruct the agent to use `null` for anything not shown, which prevents invented values.
- Every real response is cached in `snapshots/` with its URL and timestamp, so demos can be reproduced without spending credits.
- Agent runs per search are capped and logged.
- On failure, the call is retried once, then the offer is marked `missing` with a reason. The UI shows "insufficient evidence" rather than guessing.
- The API key stays server-side only.
- Site terms, rate limits and access controls are respected.

## Architecture

```mermaid
flowchart LR
    B[Buyer brief<br/>React UI] -->|POST /api/research| R[TinyFish research<br/>Search -> Fetch -> Agent fallback]
    R --> X[Extract + normalize<br/>LLM + Zod]
    X --> O[(Offer[] with provenance)]
    O -->|POST /api/evaluate| E[Decision engine<br/>cost, filters, ranking]
    E -->|POST /api/scenario| C[Counterfactual engine<br/>sliders, break-even, fallback]
    E -->|POST /api/negotiate| N[Evidence bundle -> LLM draft<br/>-> number check]
    E --> U[UI: table, sliders,<br/>evidence drawer, negotiation view]
    C --> U
    N --> U
    R -. SSE progress .-> U
```

Data flow in words:

```
Buyer brief
  -> POST /api/research   TinyFish Search -> Fetch -> Agent fallback -> extract -> normalize
  -> Offer[] with provenance (shared schema)
  -> POST /api/evaluate   cost + feasibility filters + ranking + explanations
  -> POST /api/scenario   counterfactual: quantity, discount, shipping, deadline
  -> POST /api/negotiate  evidence bundle -> LLM draft -> number check
  -> UI: table, sliders, evidence drawer, negotiation view
```

## Tech Stack

TypeScript end to end, no Python.

| Area | Tools |
|------|-------|
| Language | TypeScript (Node.js 20+) |
| Monorepo | pnpm workspaces |
| Frontend | React (Vite), React Router, Tailwind CSS, shadcn/ui, TanStack Table, TanStack Query, Recharts |
| Backend | Node.js, Express |
| Validation | Zod (one shared schema used by frontend and backend) |
| Database | SQLite (better-sqlite3) with Drizzle ORM |
| Research | TinyFish SDK (`@tiny-fish/sdk`): Search, Fetch, Agent |
| Reliability | p-limit, p-retry |
| Streaming | Server-Sent Events (SSE) |
| LLM | Provider-agnostic wrapper in `src/llm` (reads and drafts only) |
| Testing and quality | Vitest, ESLint, Prettier |

## Repository Structure

```
vendormind/
  pnpm-workspace.yaml
  packages/
    shared/            Zod Offer schema and shared types
  apps/
    web/               React + TypeScript (Vite), port 5173
      src/pages/       brief, results, sandbox, negotiate
      src/components/  table, sliders, evidence drawer, status badges
    api/               Node.js + Express + TypeScript, port 3001
      src/routes/      research, evaluate, scenario, negotiate
      src/engine/      cost, feasibility, rank, counterfactual
      src/research/    tinyfish, search, fetch, agent, extract, normalize
      src/llm/         provider wrapper, negotiate.ts, check.ts
      src/db/          sqlite client (briefs, offers, scenarios)
      fixtures/        labelled synthetic offers
      snapshots/       cached real TinyFish runs with timestamps
      tests/           engine tests and extraction tests
  docs/                README assets and architecture diagram
```

The Vite dev server proxies `/api` to the Express server, so no CORS setup is needed in development.

## Data Model and Provenance

All code imports one Offer contract from `packages/shared`.

| Field group | Contents |
|-------------|----------|
| Identity | `offerId`, `supplierName`, `productTitle`, `category`, `sourceUrl`, `retrievedAt`, `isFixture` |
| Price | `unitPrice`, `currency`, `unitBasis`, `quantityTiers[]`, `moq`, `discountsApplicable[]` |
| Logistics | `shippingCost`, `leadTimeDays`, `deliveryRegion`, `extraFees[]` |
| Spec | `attributes{}` (material, grade, capacity, certification), `specMatchFlags{}` |
| Provenance | Per field: `value`, `sourceUrl`, `retrievedAt`, `status`, `extractionMethod` |

**Field status** is one of:
- `verified`: read directly from the source page
- `inferred`: derived from other data
- `missing`: not found, with a reason
- `stale`: older than the freshness threshold

**Extraction method** is one of `search`, `fetch`, `agent` or `fixture`.

## Decision Engine

Everything that touches money is plain, deterministic, tested TypeScript.

- **`cost.ts`:** known total = unit price x quantity + shipping + fees - applicable discounts.
- **`feasibility.ts`:** hard filters for spec, MOQ and deadline, returning `pass`, `fail` or `unknown` with reasons.
- **`rank.ts`:** buyer-weighted scoring (cheapest, fastest, balanced) with the score components shown. Missing data stays `unknown`.
- **`counterfactual.ts`:** quantity sweep, break-even quantity, discount target, shipping and deadline changes, and a next-best fallback.

Hard constraints are applied before weighted ranking. If evidence is insufficient, the app says so and shows a partial estimate where it can.

## API Reference

| Method | Route | Owner | Description |
|--------|-------|-------|-------------|
| `GET` | `/health` | API | Health check used by the hosting platform. |
| `POST` | `/api/research` | Research | Runs the TinyFish cascade for a brief and returns `Offer[]` with provenance. Streams progress over SSE. |
| `POST` | `/api/evaluate` | Engine | Applies filters, computes known total cost and returns the ranking with explanations. |
| `POST` | `/api/scenario` | Engine | Recomputes the ranking for changed quantity, discount, shipping or deadline. Returns break-even and fallback. |
| `POST` | `/api/negotiate` | Engine + LLM | Builds an evidence bundle, drafts a message from it and verifies every figure and supplier name against the bundle. |

Request and response shapes are defined by the Zod schemas in `packages/shared`.

## Engineering Rules

1. The LLM never invents prices, shipping, MOQ, contacts or delivery promises. Plain TypeScript does all money math.
2. Every important field carries `value`, `sourceUrl`, `retrievedAt` and `status`.
3. Hard constraints (spec, MOQ, deadline) apply before weighted ranking. Missing data shows as unknown, never as a pass.
4. Fixtures are always labelled as fixtures and never presented as live research.
5. A human approves any outreach. The prototype only drafts and never sends.

The LLM is used only to read messy page text into the Offer schema and to write draft messages. All extraction results are cached so each page is sent to the LLM once.

## Live vs Fixture Data

| Category | Source in Round 1 |
|----------|-------------------|
| Packaging | Live TinyFish research (with cached snapshots for reproducible demos) |
| Office / industrial supplies | Live TinyFish research (with cached snapshots for reproducible demos) |
| Engineering materials | Labelled fixtures |

> Update this table to match exactly what is live in your final build. The UI shows a clear **Live / Fixture** label on every offer, and snapshot-backed results show their original retrieval timestamp.

## Getting Started

### Prerequisites

- Node.js 20 or newer
- pnpm (`corepack enable` is the easiest way)
- A TinyFish API key
- An API key for an LLM provider (or a local Ollama model for development)

### Install and run

```bash
git clone <repo-url>
cd vendormind
pnpm install

# create apps/api/.env using the variables below

# terminal 1: backend (port 3001)
pnpm --filter ./apps/api dev

# terminal 2: frontend (port 5173)
pnpm --filter ./apps/web dev
```

Open http://localhost:5173. Adjust the script names above if your `package.json` files use different ones.

## Environment Variables

**Backend (`apps/api/.env`, never commit this file)**

```
TINYFISH_API_KEY=your_tinyfish_key
LLM_PROVIDER=openrouter            # or groq, ollama, etc.
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_llm_key
LLM_MODEL=exact-model-id-from-your-provider
FRONTEND_URL=http://localhost:5173 # allowed CORS origin in production
```

**Frontend (set on the hosting platform)**

```
VITE_API_URL=https://your-backend.onrender.com   # no trailing slash
```

Never put secret keys in a `VITE_` variable. Those values are exposed in the browser.

## Testing

```bash
pnpm test
```

Vitest covers:
- Cost calculation
- Feasibility filters (pass, fail, unknown)
- Ranking reproducibility
- Break-even and counterfactual cases, including a case where changing one constraint changes the winner
- Extraction output validity

Extracted fields were also spot-checked against their source pages. Notes and known limits are in `docs/`.

## Deployment

- **Backend:** Render Web Service. Build with `corepack enable && pnpm install --frozen-lockfile`, start with `pnpm --filter ./apps/api start`, health check at `/health`.
- **Frontend:** Vercel, root directory `apps/web`, Vite preset, with `VITE_API_URL` pointing to the Render URL and a `vercel.json` rewrite so client-side routes work on refresh.
- Set `FRONTEND_URL` on the backend to the Vercel URL so CORS allows it.

Notes for the hosted version:
- On free hosting tiers the backend may sleep when idle, so the first request can be slow.
- Runtime disk is ephemeral. Committed `fixtures/` and `snapshots/` ship with the repo, but runtime database writes may be lost on restart.
- Research runs consume TinyFish credits and LLM quota, so Agent runs are capped and cached snapshots are preferred.

## Known Limitations

- This is a Round 1 prototype. Only two categories use live research.
- Extraction is spot-checked, not formally evaluated.
- Product matching across suppliers relies on mandatory attribute matching and is not yet calibrated.
- Savings shown are a baseline versus a proposed target, a **potential** only, not realized savings.
- Prices come from one-time checks of public pages and are not real-time.
- The prototype drafts negotiation messages but never sends them.
- Some sites block automation. Those offers are marked `missing` and show "insufficient evidence".

## Round 2 Roadmap

1. Electronics and clothing categories, with all five categories live
2. Savings Proof Ledger: baseline, target, real quote and realized savings
3. Formal extraction accuracy evaluation and a scenario test set
4. Automatic fact validation on drafts, plus tone options
5. Quote and PDF upload to compare private quotes with public offers
6. Saved briefs, stale-listing flags, price monitoring and alerts
7. Human-approved email outreach and purchase history

## Team

| Name | Role |
|------|------|
| `[Janshu]` | Backend and Decision Engine |
| `[Anmol]` | Frontend and Demo |
| `[Hitarth]` | Data, Research and TinyFish |

## Acknowledgements

Thanks to the organisers of `[Kritical Hacks]` and to **TinyFish** for the research APIs that power VendorMind.
