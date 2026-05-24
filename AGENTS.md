# AGENTS.md

## Project overview

Monorepo with two packages: `backend/` (Node.js/Express API) and `frontend/` (React/Vite SPA). This is an OCR + route-optimizer app for Indonesian delivery drivers.

## Commands

### Setup
```bash
# Backend (run first)
cd backend && npm install

# Frontend
cd frontend && npm install
```

### Run
```bash
# Backend must start first (port 8080)
cd backend && node index.js

# Frontend dev server (port 5173, proxies /api -> localhost:8080)
cd frontend && npm run dev
```

### Lint (frontend only)
```bash
cd frontend && npm run lint
```

### CLI test (backend must be running)
```bash
cd backend && node test.js ./path/to/screenshot.jpg
```

## Environment

Create `backend/.env` with:
```
PORT=8080
GOOGLE_MAPS_API_KEY=<key>
PROJECT_ID=<gcp-project>
LOCATION=us-central1
```

## Architecture notes

- **No TypeScript** — all code is plain JS/JSX. No tsconfig. Adjust expectations accordingly.
- **No test suite** — `backend/package.json` has a placeholder script; `test.js` is a CLI integration script, not a test runner.
- **Linting only on frontend** via ESLint flat config. Backend has no linter, formatter, or typecheck configured.
- **Two parallel geocoding strategies** — the `/api/extract-address` endpoint always resolves addresses via both Geocoding API and Places API (New), returns both results for comparison in the frontend.
- **Geocoding calls are throttled** — `asyncPool(3, ...)` limits max 3 concurrent order-processing tasks per API type. Pickup & delivery within the same order are resolved in parallel via `Promise.all`.
- **TSP solver is 2-phase brute-force** (`maps.js:optimizeSmartRoute`) — Phase 1: brute-force all pickup permutations from driver start. Phase 2: brute-force all delivery permutations from last pickup. Norm: pickup all first, then delivery (validated by field research). Complexity is 2×N! instead of (2N)!: for 6 orders, 2×720=1,440 permutations (milliseconds in Node.js) vs 12!=479M. Always finds the globally optimal order. Uses local Haversine distance matrix for speed; no Route Matrix API call needed during solving.
- **Failed order tracking** — `calculateRouteForAPI` tracks orders that fail geocoding and returns `failed_orders` array in the API response. The frontend displays a Bahasa Indonesia error toast naming the failed sellers.
- **Gemini model is env-configurable** — `backend/services/agent.js` uses `process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'`. Previously hardcoded but now overridable.
- **Routes API V2 quirks** — `routingPreference` switches dynamically: `TRAFFIC_AWARE_OPTIMAL` when `points² <= 100`, otherwise `TRAFFIC_AWARE`. Also sets `avoidTolls: true` and `avoidHighways: true` (motorcycle safety). `computeRouteMatrix` response defensively parsed for NDJSON (newline-delimited JSON) strings.
- **Frontend duration parsing** — `formatDuration` in `App.jsx` handles Routes API V2 `duration` objects (`{seconds, nanos}`), not just strings/numbers.
- **Per-step navigation uses `place_id`** — Google Maps deep links for individual waypoints include `destination_place_id` when available, reducing mobile geocoding failures.
- **Cache updates are awaited** — `backend/services/cache.js` now `await`s the Firestore `hit_count` increment with `try/catch` instead of fire-and-forget.
- **Backend serves pre-built frontend** — `backend/public/` contains compiled Vite output. Express serves these statically and has an SPA fallback for non-API GET requests.
- **UI upload improvements** — thumbnail previews (48×48), drag & drop with visual feedback, and per-file compression status badges (`Dikompresi` / `Dilewati`) with before/after size deltas.

## Language conventions

- Code identifiers and API names are in English.
- UI text, README, code comments, and Gemini prompts are in **Bahasa Indonesia**. Keep them that way.

## OpenCode agents

This repo has custom OpenCode subagents in `.opencode/agents/`: `docs-writer`, `review`, `security-auditor`. Their permissions and models are defined there. Use the `review` and `security-auditor` agents for PR-quality work.

## Security

`scratch/deploy_vm.sh` contains a hardcoded Google Maps API key. Do not propagate it. The `.env` file and `sa-key.json` are gitignored.
