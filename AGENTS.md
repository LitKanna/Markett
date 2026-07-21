# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
YOLKO (`Markett`) is a single **static, one-page marketing/ordering website** for selling
fresh egg trays. The core files are `index.html`, `styles-modern.css`, `app.js`, and `config.js`.
There is **no framework and no build step** — the files are served as-is.

### Run the site (the main product)
From the repo root:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. No install is required just to view/use the site.

### Ordering flow works fully client-side (non-obvious)
`app.js` sets `API_BASE` to `https://getyolko.com` whenever the site is **not** served from a
`getyolko.com` host (i.e. always in local dev). The `/api/*` calls (`settings`, `orders`,
`checkout`) therefore hit production and fail silently in local dev. The booking flow
(fill form → **Reserve** → confirmation receipt with WhatsApp link) degrades gracefully and
works end-to-end locally **without** any backend. Use the "Reserve" button (not "Buy now") to
demonstrate the flow without needing Stripe.

### Optional backend (not needed to run/demo the site)
`infra/cloudflare-worker.mjs` is a Cloudflare Worker (config in `wrangler.toml`) providing
`/api/*` and an `/admin` dashboard. Run with `npx wrangler dev` (defaults to port 8787). It
needs a KV namespace bound as `DATA` (wrangler dev provides a local simulation) plus
`ADMIN_KEY` and `STRIPE_KEY` secrets; Stripe endpoints return 503 when `STRIPE_KEY` is unset.
`wrangler` is intentionally not a declared dependency — invoke via `npx`.

Non-obvious local-testing gotcha: the Worker's first `fetch` step force-redirects any
`http:` (or `www.`) request to `https:` with a 301. Plain `npx wrangler dev` serves **http**,
so every `/api/*` and `/admin` request 301s and the response body is empty — making the admin
look broken even when it isn't. Run it over https instead, e.g.
`npx -y wrangler dev --local-protocol https --var ADMIN_KEY:testkey --port 8787`, then hit
`https://localhost:8787` (use `curl -k` / accept the self-signed cert). Sign into `/admin`
with whatever `ADMIN_KEY` you passed. Seed/inspect local orders with
`npx wrangler kv key put --local --namespace-id <id> "order:..." '{...}'`.

### No lint / test / build tooling
There is no ESLint/Prettier/Ruff or test framework configured. `npm test` is a placeholder
that intentionally fails (`echo "Error: no test specified" && exit 1`) — do not treat that as
a real failure. `.github/workflows/` handles GitHub Pages + Worker deploys only.

### Other tooling (optional, ops-only)
- `infra/*.py` image generators need `pip install -r requirements.txt` (opencv, Pillow).
- `infra/meta-*.mjs` Meta ad automation uses Playwright (installed via `npm install`) and
  requires `npx playwright install chromium` plus a `META_ACCESS_TOKEN`.
