# VendorMind — React + CSS

Converted from the supplied single HTML file into a Vite React project using JavaScript and JSX. No TypeScript or Tailwind is needed.

## Run in VS Code

Open this folder in VS Code, open its terminal, and run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Node.js 20.19+ or 22.12+ is required by Vite 7.

## Files

- `src/App.jsx`: React components, purchase state, supplier catalogue and decision engine.
- `src/styles/App.css`: all CSS, including the original inline styles moved into reusable layout classes.
- `src/main.jsx`: React entry point.
- `index.html`: HTML shell and font link.
- `vite.config.js`: Vite configuration.

To use this in an existing Vite React project, copy `src/App.jsx` and `src/styles/App.css` into its `src` folder. Ensure its entry file imports `App.jsx`. The Google Fonts link in `index.html` is optional; the CSS has system font fallbacks.

## Included behaviour

Prototype sign-in and demo account; purchase details; supplier editing; comparison; evidence labels; scenario sliders; break-even analysis; negotiation drafts; savings ledger; responsive layout and automatic dark theme.

## Original prototype integrations

- Sign-in is a local prototype, not real authentication. Only the displayed user name/email is saved in localStorage; purchase data is kept in memory.
- Supplier offers use the original static demo catalogue. Set `DATA_SOURCE.liveUrl` in `src/App.jsx` to your backend endpoint to connect supplier data. The expected JSON contract is documented immediately above that setting.
- The original AI helper calls `window.claude.use("sample")`, which is unavailable in a standard Vite app. Manual entry and the worked example remain usable. Replace `askJson` with a call to your backend to add AI extraction; keep provider API keys on the backend.
- Original placeholder supplier links, illustrative evidence labels and sample currency conversion rates are preserved.

## Build

```sh
npm run build
npm run preview
```
