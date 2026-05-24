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
- **TSP solver is brute-force** (`maps.js:optimizeSmartRoute`) — generates all permutations with a pickup-before-delivery constraint. Works for small N (max 5 screenshots per upload). Falls back to Haversine distance if Route Matrix API fails.
- **Gemini model is hardcoded** — `backend/services/agent.js` uses `gemini-3.1-flash-lite` as a string literal.
- **Routes API V2 quirks** — `routingPreference` switches dynamically: `TRAFFIC_AWARE_OPTIMAL` when `points² <= 100`, otherwise `TRAFFIC_AWARE`. Also sets `avoidTolls: true` and `avoidHighways: true` (motorcycle safety).
- **Backend serves pre-built frontend** — `backend/public/` contains compiled Vite output. Express serves these statically and has an SPA fallback for non-API GET requests.

## Language conventions

- Code identifiers and API names are in English.
- UI text, README, code comments, and Gemini prompts are in **Bahasa Indonesia**. Keep them that way.

## OpenCode agents

This repo has custom OpenCode subagents in `.opencode/agents/`: `docs-writer`, `review`, `security-auditor`. Their permissions and models are defined there. Use the `review` and `security-auditor` agents for PR-quality work.

## Security

`scratch/deploy_vm.sh` contains a hardcoded Google Maps API key. Do not propagate it. The `.env` file and `sa-key.json` are gitignored.
