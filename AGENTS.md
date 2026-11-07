# AGENTS.md — SCOOP landing page

Static site + one serverless API. **No build step, no package manager, no node_modules.** All JS libraries (`three.module.min.js`, `model-viewer.js`) are vendored in `assets/`.

## Layout

- `index.html` — the whole landing page: one large HTML file, most styling/scripts inline. `assets/features.js` (scrollytelling) and `assets/globe.js` (three.js Earth) are the only linked scripts.
- `api/` — FastAPI app (`index.py`) serving read-only queries over bundled SQLite `scoop_public.db`. `fix_public_db.py` is a one-off DB-regeneration script, not part of the app.
- Deployment targets: GitHub Pages (deploy-from-branch, `.github/workflows/static.yml` uploads the entire repo) and Vercel (preset "Other", output `.`).

## Commands

- Preview locally: `python3 -m http.server` from the repo root. Plain `file://` won't work — `globe.js` is an ES module and browsers block module imports over `file://`.
- API locally: `pip install -r requirements.txt` pins only `fastapi`; `uvicorn` is not included, install it separately, then `uvicorn api.index:app`. Browse the auto-docs at `/api/docs`.
- No tests, linter, or typecheck exist anywhere in the repo.

## Gotchas

- **GitHub Pages serves no API.** The `/api/*` endpoints exist only on Vercel (`vercel.json` rewrites `/api/(.*)` → `/api/index`, and bundles `scoop_public.db` into the function via `includeFiles`). Pages deployments are static-only.
- **The domain `website-jade-eta-97.vercel.app` is hardcoded** in `index.html` (`canonical`, `og:url`, `og:image`, `twitter:image`). If the Vercel project URL changes, update these.
- **The database is scrubbed by design.** `api/scoop_public.db` must contain no device identifiers or hostnames — `fix_public_db.py` deliberately nulls socket aliases (they carry hostnames) and the app's docstring promises location/device-free data. Don't reintroduce identifying data into DB rows, new endpoints, or API responses.
- **Every published figure is derivable from `telemetry_samples`** (trapezoid integration of socket power × static grid factor). `fix_public_db.py` recomputes `carbon_accounting`, `session_analysis`, and `load_level_analysis` from raw samples and is safe to rerun: `python3 api/fix_public_db.py api/scoop_public.db`. Don't hand-edit derived tables — rerun the script instead.
- The DB is opened read-only (`file:...?mode=ro`) and the API allows only GET (CORS `allow_methods=["GET"]`). It is intentionally write-free.
- The join-form CTA has no backend — it builds a `mailto:` link inline in `index.html`. Don't assume there's a form endpoint.
- The hero globe fetches live data client-side from `api.wheretheiss.at` and `api.carbonintensity.org.uk`; when WebGL is unavailable it falls back to `assets/earth.gif` (element `#globe-fallback`). Test fallback behavior when touching `globe.js`.
