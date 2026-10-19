# VendorMind — React + CSS

Converted from the supplied single HTML file into a Vite React project using JavaScript and JSX. No TypeScript or Tailwind is needed.

## Run in VS Code

Open the `frontend/` folder in VS Code, open its terminal, and run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Node.js 20.19+ or 22.12+ is required by Vite 7.

## Files

- `frontend/App.jsx`: React components, purchase state, supplier catalogue and decision engine.
- `frontend/styles/App.css`: all CSS, including the original inline styles moved into reusable layout classes.
- `frontend/main.jsx`: React entry point.
- `frontend/index.html`: HTML shell and font link.
- `frontend/vite.config.js`: Vite configuration.
- `frontend/package.json` and `frontend/package-lock.json`: frontend dependencies and scripts.

To use this in another Vite React project, copy `frontend/App.jsx` and `frontend/styles/App.css` into its source folder and ensure its entry file imports `App.jsx`. The Google Fonts link in `index.html` is optional; the CSS has system font fallbacks.

## Included behaviour

Prototype sign-in and demo account; purchase details; supplier editing; comparison; evidence labels; scenario sliders; break-even analysis; negotiation drafts; savings ledger; responsive layout and automatic dark theme.

## Original prototype integrations

- Sign-in is a local prototype, not real authentication. Only the displayed user name/email is saved in localStorage; purchase data is kept in memory.
- The React prototype continues to use its original static demo catalogue. The Round 1 API is a separate backend with its own validated offer contract; use a frontend adapter before connecting it to `DATA_SOURCE.liveUrl`.
- The original AI helper calls `window.claude.use("sample")`, which is unavailable in a standard Vite app. Manual entry and the worked example remain usable. Replace `askJson` with a call to your backend to add AI extraction; keep provider API keys on the backend.
- Original placeholder supplier links, illustrative evidence labels and sample currency conversion rates are preserved.

## Build

Run these commands from `frontend/`:

```sh
npm run build
npm run preview
```

## Backend API

The independent Round 1 Express/TypeScript backend is in [`../backend/`](../backend/README.md). It provides TinyFish supplier research, provenance-aware SQLite persistence, deterministic evaluation and counterfactual scenarios, and evidence-grounded negotiation drafts. Its setup, environment variables, routes, and tests are documented in the backend README.
