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

### Dynamic Stripe Checkout (no fixed Payment Links)
Buy now / Pay online call `POST /api/checkout`, which builds a Stripe Checkout Session from
**live admin `settings.prices`** plus `deliveryFee` when fulfillment is delivery. Do **not**
paste `buy.stripe.com` Payment Links into `config.js` — those freeze old amounts ($12/$23/$66)
and ignore delivery. `config.stripeLinks` is intentionally empty.

### Saturday delivery (45 km from Sydney Markets)
- Hub: Paddy's Markets Flemington / Sydney Markets (`-33.8667, 151.0694`).
- Delivery is **Saturday only**, flat **+$5** on the entire order, and **only within 45 km**
  (road-km estimate = haversine × 1.3, or × 1.5 for harbour crossings).
- Checkout captures **street, suburb, city, postcode**. Server validates via
  `infra/delivery-zones.mjs` (`checkDeliveryAddress`) inside `POST /api/orders`.
- Client can preview with `POST /api/delivery-check` (same origin rules as orders).
- Out-of-range returns `code: "delivery_range"`. Unknown suburb/postcode returns
  `code: "delivery_address"`.
- Meta ads geo should match: **45 km** custom location on the same hub
  (`infra/meta-launch.mjs`, `infra/meta-update-radius.mjs`).

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
- **Owner accounts (all yours):**
  - `getyolkonow@gmail.com` — preferred for new Google/Meta business signups when creating fresh accounts.
  - `getyolko@gmail.com` — also a business Google account.
  - `maruthi4a5@gmail.com` — owner/infra account (Cloudflare `yolko-site.maruthi4a5.workers.dev`); password for this address may be on the VM at `~/.config/yolko/accounts.env` (never in git).
- **Passwords:** never commit. Prefer Cursor Secrets for cross-run persistence.
- WhatsApp sales number on site: `+61 433 975 055` (`config.js`).
- When logging into Desktop for ads/GBP/Meta, prefer **`getyolkonow@gmail.com`** for new consoles; use **`maruthi4a5@gmail.com`** where that account already owns the console.

### No lint / test / build tooling
There is no ESLint/Prettier/Ruff or test framework configured. `npm test` is a placeholder
that intentionally fails (`echo "Error: no test specified" && exit 1`) — do not treat that as
a real failure. `.github/workflows/` handles GitHub Pages + Worker deploys only.

### Other tooling (optional, ops-only)
- `infra/*.py` image generators need `pip install -r requirements.txt` (opencv, Pillow).
- `infra/meta-*.mjs` Meta ad automation uses Playwright (installed via `npm install`) and
  requires `npx playwright install chromium` plus a `META_ACCESS_TOKEN`.
- **Sold-out auto-pause:** when `traysAvailable` hits `0` (box = 6 trays), the Worker pauses
  configured Meta ad sets; when stock is restocked it resumes **only if** this automation
  paused them. Needs Worker secret `META_ACCESS_TOKEN` (optional `META_ADSET_ID` /
  `META_ADSET_IDS`). Manual/CLI: `node infra/meta-stock-sync.mjs`. Cron every 15m in
  `wrangler.toml`. Admin check: `GET/POST /api/meta-ads-stock-sync` with admin key.

### Studio hero branding
Only `studio-tray-v2` was intentionally edited to a **small same-corner YOLKO**
(user request for that one stacked-boxes shot). Do **not** regenerate `v5` / `v6` /
other heroes unless the user explicitly asks. Prefer Higgsfield MCP for branding
edits — not Cursor `GenerateImage`. After asset changes: write size variants +
`.webp`, bump `?v=` in `index.html`, pin `DEPLOY_SHA`, bump `X-Yolko-Build`,
`npx wrangler deploy`.

**Higgsfield auth:** Cloud agents load MCP OAuth **only at start**. If Higgsfield
shows `needsAuth`, start a **new** cloud agent after OAuth in Cursor desktop.
