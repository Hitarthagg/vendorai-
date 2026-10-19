# VendorMind frontend

The Vite/React UI connects to the Express backend for supplier research, offer evaluation, scenarios, and negotiation drafts. Node.js 20.19+ or 22.12+ is needed for Vite 7.

## Run locally

In one terminal, start the backend:

```sh
cd backend
cp .env.example .env
# Edit backend/.env and set TINYFISH_API_KEY for live research.
npm ci
npm run dev
```

In a second terminal, start the UI:

```sh
cd frontend
npm ci
npm run dev
```

Open the Vite URL shown in the terminal. `vite.config.js` forwards `/api` calls to `http://localhost:3001`. For deployment, serve the built frontend with a same-origin `/api` reverse proxy to the backend. Provider API keys must stay in the backend environment and must not be put in Vite variables.

## Workflow

Create a purchase brief, then search. The UI sends the brief to `POST /api/research`, passes the unmodified returned offers and `briefId` to `POST /api/evaluate`, and displays the backend's ranked, partial, and excluded rows. Scenario and negotiation actions call `POST /api/scenario` and `POST /api/negotiate`. Drafts are for review and manual copying; they are not sent automatically.

Live TinyFish research covers packaging and office/industrial products. Engineering materials and searches without TinyFish credentials use clearly marked sample fixtures. Published website terms are not guaranteed supplier quotes: verify availability, pricing, shipping, and delivery before purchasing. The UI keeps purchase briefs in browser localStorage; this prototype has no real sign-in.

See [backend setup and API](../backend/README.md) for the full contract. Run `npm run build` from this directory to verify a production bundle.
