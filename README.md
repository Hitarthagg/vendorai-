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
| Frontend | React (Vite) |
| Backend | Node.js, Express |
| Validation | Zod |
| Database | SQLite (better-sqlite3) with Drizzle ORM |
| Research | TinyFish SDK (`@tiny-fish/sdk`): Search, Fetch, Agent |
| Reliability | p-limit |
| Streaming | Server-Sent Events (SSE) |
| LLM | OpenAI-compatible provider wrapper (optional) |
| Testing | Vitest |

## Repository Structure

```
vendormind/
  backend/              Express API, port 3001
    src/                API, research, decision engine, LLM and SQLite code
    tests/              Backend Vitest tests
    data/               Local SQLite database (created at runtime)
    snapshots/          Cached research pages
    .env.example        Backend environment-variable template
  frontend/             React + Vite UI, port 5173
    utils/              React app and API client
    styles/             UI styles
  render.yaml           Render Blueprint for the backend
```

The Vite development server proxies `/api` requests to the backend at
`http://localhost:3001`, so no CORS setup is needed for local development.

## Data Model and Provenance

The backend validates API input with Zod schemas defined alongside its
implementation.

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
| `GET` | `/api/health` | API | Health check used by the hosting platform. |
| `POST` | `/api/research` | Research | Runs the TinyFish cascade for a brief and returns `Offer[]` with provenance. Streams progress over SSE. |
| `POST` | `/api/evaluate` | Engine | Applies filters, computes known total cost and returns the ranking with explanations. |
| `POST` | `/api/scenario` | Engine | Recomputes the ranking for changed quantity, discount, shipping or deadline. Returns break-even and fallback. |
| `POST` | `/api/negotiate` | Engine + LLM | Builds an evidence bundle, drafts a message from it and verifies every figure and supplier name against the bundle. |

Request and response shapes are validated by the backend's Zod schemas.

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
- npm (included with Node.js)

### Install

Clone the repository, then install the backend and frontend dependencies
separately:

```powershell
cd backend
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

```powershell
cd frontend
npm ci
```

On macOS or Linux, use `cp .env.example .env` in `backend/` instead of
`Copy-Item`. Run each install block from the repository root.

### Configure the backend

Edit `backend/.env` if you want live supplier research or LLM-assisted
extraction. `backend/.env.example` contains the defaults. The app can also run
without provider keys; supplier research then uses clearly labelled fixtures.
Keep API keys in the backend `.env` only, never in the frontend.

- `TINYFISH_API_KEY` enables live supplier search and page research.
- `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` enable LLM-assisted extraction.
  For OpenRouter, use `https://openrouter.ai/api/v1` as the base URL and the
  exact model ID provided by OpenRouter.
- `PORT`, `DATABASE_PATH`, and `SNAPSHOT_DIR` are optional; the defaults are
  port `3001`, `./data/vendormind.sqlite`, and `./snapshots`.

### Run locally

Start each app in its own terminal from the repository root.

**Terminal 1 — backend:**

```powershell
cd backend
npm run dev
```

**Terminal 2 — frontend:**

```powershell
cd frontend
npm run dev
```

Open the Vite URL shown in the frontend terminal (usually
`http://localhost:5173`). The backend API is available at
`http://localhost:3001`; check `http://localhost:3001/api/health` to confirm it
is running. Leave both terminals open while using the app.

## Environment Variables

**Backend (`backend/.env`, never commit this file)**

```
TINYFISH_API_KEY=
TINYFISH_AGENT_ENABLED=false
TINYFISH_AGENT_MAX_RUNS=0
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=
LLM_MODEL=minimax/minimax-m3.1-flash:free
```

The TinyFish and LLM keys are optional for starting the app. Without a
`TINYFISH_API_KEY`, research uses labelled fixtures. Without the LLM settings,
live supplier pages can still be found when TinyFish is configured, but
LLM-assisted extraction is unavailable. Never put secret keys in frontend
environment variables; those values are exposed in the browser.

## Testing

```powershell
cd backend
npm test
```

Backend Vitest tests cover:
- Cost calculation
- Feasibility filters (pass, fail, unknown)
- Ranking reproducibility
- Break-even and counterfactual cases, including a case where changing one constraint changes the winner
- Extraction output validity

Extracted fields were also spot-checked against their source pages. Notes and known limits are in `docs/`.

## Deployment

- **Backend:** A Render Blueprint is defined in `render.yaml`. See
  [backend/README.md](backend/README.md#deploy-to-render) for deployment details.
- **Frontend:** The frontend is a Vite app in `frontend/`. A deployed frontend
  needs a same-origin `/api` proxy or rewrite to the backend API. The local
  Vite proxy configured in `frontend/vite.config.js` applies only in development.

Notes for hosted deployments:
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
