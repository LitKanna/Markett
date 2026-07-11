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

### Higgsfield MCP — how we fix auth (required reading for every agent)

YOLKO hero/product photography for this repo is done with **Higgsfield MCP only**.
Do **not** use Cursor’s built-in `GenerateImage` tool for site heroes — those assets
were rejected and reverted (build 94).

#### Symptom
`GetMcpTools` / Higgsfield calls return `serverStatus: "needsAuth"` (or expired token).
Cloud agents **cannot** complete interactive OAuth themselves (`mcp_auth` is
desktop-IDE-only). Asking the agent to “just log in” from inside the cloud VM fails.

#### Fix that worked (Jul 2026) — do **not** quit Cursor
You do **not** need to close or relaunch the Cursor desktop app.

1. Open **Cursor desktop** (the IDE on your machine — not the cloud agent chat alone).
2. Start a **new** cloud agent: **Agents → +**.
3. In that new-agent setup panel, open **MCP Servers**.
4. Find **Higgsfield**:
   - Click **Log out** (clears the stale/expired OAuth session).
   - Toggle Higgsfield **OFF**, then **ON** again (or toggle **ON** if it was off).
   - Complete **Google OAuth** in the browser popup when prompted.
5. Confirm Higgsfield shows **ready / green** (not needsAuth) **before** you submit the
   agent prompt.
6. Submit the task. Prefer a **fresh** agent after re-auth — OAuth is loaded when the
   agent starts. Mid-run re-auth on an already-running agent often does **not** attach;
   if an old run still says `needsAuth`, start another new agent after the logout→OAuth
   steps above.

#### How agents should use Higgsfield once ready
1. Call `GetMcpTools` for server `Higgsfield` and confirm `serverStatus: "ready"`.
2. Prefer `models_explore` → then `generate_image` (and `media_upload` / `media_confirm`
   or `media_import_url` when feeding local/repo reference photos).
3. For edits to existing heroes, upload the current asset as a reference and prompt an
   explicit brand change (tiny corner mark, no subline) rather than inventing a new scene.
4. Download results, write repo derivatives (`-928`, `-640`, `-square-560` + `.webp`),
   bust `?v=` / `CHALK_ASSET_VER`, pin `DEPLOY_SHA`, bump `X-Yolko-Build`,
   `npx wrangler deploy`.

#### If auth fails again
Repeat the **Log out → toggle ON → Google OAuth → new agent** sequence. Do not fall back
to Cursor `GenerateImage` or unsolicited OpenCV/Pillow redraws unless the user explicitly
allows it.

### Handoff — hero branding via Higgsfield (pending)
**Live site:** `https://getyolko.com/` · Worker build **95** · branches
`cursor/setup-dev-environment-9869` (PR #44) / `cursor/yolko-tiny-corner-39c4` (PR #45).

**User request:** On shop hero boxes, make **YOLKO** a **tiny bottom-corner** mark (not
large/centered). On the closeup tray-on-box slide, also remove any
**“Fresh eggs Flemington”** subline. Keep chalkboard price heroes working ($12–$20).
Higgsfield MCP only.

**Verified current assets (still wrong until regenerated):**
- `assets/chalk-tray/{12–20}-*.jpg` — large centered **YOLKO** on the box face
- `assets/studio-tray-v2-*` — large centered **YOLKO** on each box
- `assets/studio-tray-v5-*` — large framed centered **YOLKO** stamps on boxes
- `assets/studio-tray-v6-*` — large centered **YOLKO** + **“Fresh eggs Flemington”**
- Classic `studio-tray` (no box brand) can stay as-is

**Target look:** same market/shop scenes; **YOLKO** ≈5–8% of box width in a bottom
corner of each visible cardboard face. No centered mega-logo. No Flemington subline on
v6. Chalkboard `$N/TRAY` must stay readable ($12–$20 set).

**Export + deploy:** masters → `{name}-928.jpg`, `-640.jpg`, `-square-560.jpg` + `.webp`
(quality ~88). Bust cache versions. Pin `DEPLOY_SHA`, bump `X-Yolko-Build` (next **96**),
`npx wrangler deploy`.
