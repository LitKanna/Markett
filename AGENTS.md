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
The Worker serves site files from the immutable `DEPLOY_SHA` near the top of
`infra/cloudflare-worker.mjs`; update that pin to the merged site commit before a production
deploy. `npm run deploy` requires the `CLOUDFLARE_API_TOKEN` GitHub Actions secret.

Admin **Product** (`trayWeight`) drives storefront labels via `PRODUCT_TYPES` in `app.js`
(`1.5`, `1.75`, `fr-700`, `fr-600`). Changing it in `/admin` updates trust strip, pack line,
FAQ, and image alts on the next page load — no HTML edit needed.

Orders store `ip`, `country`, `asnOrg`, and `ua` (from Cloudflare). Admin flags non-AU IPs,
datacenter ASNs, known test phones, and repeat IPs. Rate limits: 5 orders / IP / 24h and
3 / phone / 24h. Do **not** place test bookings against production — local Reserve hits
`https://getyolko.com/api/orders`.

### No lint / test / build tooling
There is no ESLint/Prettier/Ruff or test framework configured. `npm test` is a placeholder
that intentionally fails (`echo "Error: no test specified" && exit 1`) — do not treat that as
a real failure. `.github/workflows/` handles GitHub Pages + Worker deploys only.

### Other tooling (optional, ops-only)
- `infra/*.py` image generators need `pip install -r requirements.txt` (opencv, Pillow).
- `infra/meta-*.mjs` Meta ad automation uses Playwright (installed via `npm install`) and
  requires `npx playwright install chromium` plus a `META_ACCESS_TOKEN`.

### Handoff — hero branding via Higgsfield (pending)
**Live site:** `https://getyolko.com/` · Worker build **95** · branch
`cursor/setup-dev-environment-9869` · PR #44.

**User request (not finished):** On shop hero boxes, make **YOLKO** a **tiny bottom-corner**
mark (not large/centered). On the closeup tray-on-box slide, also remove any
**“Fresh eggs Flemington”** subline. Keep chalkboard price heroes working ($12–$20).

**Do this with Higgsfield MCP only** (`generate_image` / media tools). Do **not** use Cursor
`GenerateImage` — user rejected those assets and we reverted them (build 94).

**Current rotator slides (after v4 removal):** chalk-tray (price-swapped), studio-tray-v2,
v5, v6, plus classic `studio-tray`. Assets under `assets/chalk-tray/` and
`assets/studio-tray-v*`. Cache via `?v=` in `index.html` and `CHALK_ASSET_VER` in `app.js`.
After asset commits: pin `DEPLOY_SHA` in `infra/cloudflare-worker.mjs`, bump
`X-Yolko-Build`, `npx wrangler deploy`.

**Higgsfield auth note:** Cloud agents load MCP OAuth at start. If this run shows
`needsAuth` / `Invalid or expired token`, start a **new** agent with Higgsfield toggled ON
after web re-auth: Agents → + → MCP Servers → Higgsfield → Log out → toggle ON → Google
OAuth. Mid-run OAuth does not hot-reload onto an already-running agent.

**Prior agent transcript:** search cloud agents for setup-dev-environment / Markett if you
need full chat history; durable facts are this section + git log on the PR branch.
