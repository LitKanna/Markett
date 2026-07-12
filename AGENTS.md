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

### Admin login
`/admin` is an HTML page embedded in `infra/cloudflare-worker.mjs` (`ADMIN_HTML`).
Auth is `Authorization: Bearer <ADMIN_KEY>` against the Worker secret `ADMIN_KEY`.
If sign-in silently fails, check that the admin `<script>` still parses (`node --check` on
extracted script) — nested `\'` inside the `ADMIN_HTML` template literal previously broke
the whole page JS (including login). Prefer `qid(id)` for inline onclick string args.

### Chalk-tray price heroes ($1–$30)
Changing **tray1** price in admin swaps hero/order chalk images via `applyChalkPriceImage`
(`CHALK_PRICES` / `CHALK_ASSET_VER` in `app.js`). Dozens images are unaffected. Assets live
under `assets/chalk-tray/{N}-*`. After regenerating masters, bump `CHALK_ASSET_VER` and
`?v=` in `index.html`, extend `infra/asset-registry.json`, re-embed `ASSET_REGISTRY` in the
worker, pin `DEPLOY_SHA`, bump `X-Yolko-Build`, then `npx wrangler deploy`.

**Hero sharpness:** keep `HERO_SIZES` honest about the showcase width (not capped at 640px) and ship chalk srcset through **2048w**. Undersized `sizes` makes retina browsers pick soft 640/928 frames.

**Chalk swap:** `applyChalkPriceImage` preloads then crossfades via a hold-frame (`img.chalk-hold`) so price changes never flash the dark card background.

**FOUC note:** HTML no longer hardcodes `$12` chalk srcs. An inline bootstrap next to the
hero/order chalk `<picture>` picks `localStorage.yolko.tray1Price` (else live fallback)
before first paint; `applySettings` refreshes that cache.

**SEO:** Keep title/meta/OG/Twitter/JSON-LD price + hours aligned with `/api/settings`.
`applySeoMeta()` updates head + `#yolko-jsonld` after settings load. Static HTML fallbacks
should match the current live tray1 price. After SEO HTML changes, pin `DEPLOY_SHA`, bump
`X-Yolko-Build`, deploy, then optionally `node infra/seo-indexnow.mjs`.


### Business accounts (non-obvious)
- **Public / ops email for getyolko.com:** `getyolko@gmail.com` — use this for Google Business Profile, Google Ads, Gmail replies, and site-related Google logins.
- **Cloudflare Worker account** may still be under `maruthi4a5@gmail.com` (workers.dev subdomain). Do not assume those are the same login.
- WhatsApp sales number on site: `+61 433 975 055` (`config.js`).

### No lint / test / build tooling
There is no ESLint/Prettier/Ruff or test framework configured. `npm test` is a placeholder
that intentionally fails (`echo "Error: no test specified" && exit 1`) — do not treat that as
a real failure. `.github/workflows/` handles GitHub Pages + Worker deploys only.

### Other tooling (optional, ops-only)
- `infra/*.py` image generators need `pip install -r requirements.txt` (opencv, Pillow).
- `infra/meta-*.mjs` Meta ad automation uses Playwright (installed via `npm install`) and
  requires `npx playwright install chromium` plus a `META_ACCESS_TOKEN`.

### Handoff — hero branding via Higgsfield (pending)
**Live site:** `https://getyolko.com/` · Worker build **95** · base branch
`cursor/setup-dev-environment-9869` · PR #44 · follow-up branch
`cursor/yolko-tiny-corner-39c4` (agent `bc-c894bd07…`, also blocked on auth).

**User request (not finished):** On shop hero boxes, make **YOLKO** a **tiny bottom-corner**
mark (not large/centered). On the closeup tray-on-box slide, also remove any
**“Fresh eggs Flemington”** subline. Keep chalkboard price heroes working ($1–$30).

**Do this with Higgsfield MCP only** (`generate_image` / media tools). Do **not** use Cursor
`GenerateImage` — user rejected those assets and we reverted them (build 94). Do **not**
fall back to local OpenCV/Pillow redraws unless the user explicitly allows it.

**Chalk-tray status (done):** `assets/chalk-tray/{1–30}-*` — plain kraft box (no large
YOLKO), three stacked clear trays, chalkboard upper-left `FRESH EGGS — $N / TRAY`.
Wired via `CHALK_PRICES` / `CHALK_ASSET_VER` in `app.js` (tray1 price only; dozens
unchanged). Hero cover uses `object-position: left 28% top 18%` so the board stays in frame.

**Still pending (studio heroes):**
- `assets/studio-tray-v2-*` — large centered **YOLKO** on each box
- `assets/studio-tray-v5-*` — large framed centered **YOLKO** stamps on boxes
- `assets/studio-tray-v6-*` — large centered **YOLKO** + **“Fresh eggs Flemington”** subline
- Classic `studio-tray` (no box brand) can stay as-is

**Target look (studio):** same market/shop scenes, but **YOLKO** is a small quiet mark in
the **bottom-left or bottom-right corner** of each visible cardboard box face (≈5–8% of
box width). No centered mega-logo. No Flemington subline on v6.

**Export pipeline after Higgsfield masters:** for each master, write
`{name}-928.jpg` (hero), `{name}-640.jpg`, `{name}-square-560.jpg` + matching `.webp`
(quality ~88). Chalk set needs all prices 1–30. Bust `?v=` in `index.html` and
`CHALK_ASSET_VER` in `app.js`. Then pin `DEPLOY_SHA` in `infra/cloudflare-worker.mjs` to
the asset commit, bump `X-Yolko-Build`, `npx wrangler deploy`.

**Higgsfield auth note (blocking):** Cloud agents load MCP OAuth **only at start**.
This run and the prior handoff run both saw `needsAuth`; interactive `mcp_auth` is
desktop-IDE-only and does **not** hot-reload mid-run. To unblock:

1. Cursor desktop → Agents → **+** new cloud agent
2. MCP Servers → **Higgsfield** → Log out → toggle **ON** → complete Google OAuth
3. Confirm Higgsfield shows a green/ready state **before** submitting the prompt
4. Prompt: continue AGENTS.md handoff — tiny corner YOLKO on chalk-tray + v2/v5/v6,
   remove Fresh eggs Flemington on v6, deploy like before (Higgsfield MCP only)

**Prior agent transcript:** durable facts are this section + git log on PR #44.
