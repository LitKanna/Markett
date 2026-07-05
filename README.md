# Markett - YOLKO

One-page marketing site for selling fresh egg trays with **Friday** and **Saturday** pickup at Paddy's Markets Flemington.

## Bundles

| Bundle | Eggs | Price |
|---|---|---:|
| 1 tray | 30 | $12 |
| 2 trays | 60 | $23 |
| Full box | 180 | $66 |

## Configure (config.js)

- `whatsappNumber` — enables a one-tap WhatsApp booking button
- `stripeLinks` — Stripe Payment Links enable "Pay online now" buttons
- `traysAvailableThisWeek` — limited-stock note under prices

See `ads/setup-guide.md` for step-by-step setup, and `ads/` for
ready-to-paste Facebook, Instagram, and Google ad campaigns.

## Higgsfield (design assets)

Generate mockup backgrounds and social graphics via [Higgsfield Cloud](https://cloud.higgsfield.ai/api-keys). Real product photos in `assets/references/` are kept separate — generated files land in `assets/generated/higgsfield/`.

```bash
# List configured jobs
npm run higgsfield:list

# Run enabled jobs (set HF_CREDENTIALS or HF_API_KEY + HF_API_SECRET)
npm run higgsfield:sync

# Run one job
npm run higgsfield:sync -- --job hero-geometric-field
```

Enable jobs in `infra/higgsfield.config.json`, or trigger a manual sync from GitHub Actions (**Higgsfield asset sync**) after adding `HF_API_KEY` and `HF_API_SECRET` repository secrets.

## Preview locally (on your computer only)

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

**Note:** `localhost` only works on the same device running the server. It will **not** work on your phone — use the live URL below instead.

## Live website

**https://getyolko.com/**

## Pickup schedule

| Day | Hours | Location |
|-----|-------|----------|
| **Friday** | 10:00 AM – 4:30 PM | Paddy's Markets Flemington, Building D |
| **Saturday** | 6:00 AM – 2:00 PM | Paddy's Markets Flemington, Building D |

## Pricing

- 30-egg tray: **$12**
- Payment on pickup (cash or card)

## How to share it

- Google: use words like "eggs Flemington" and "fresh eggs near me"
- Facebook: share in Flemington, Homebush, Strathfield, Lidcombe, and Auburn groups
- Instagram: post weekly stock photos and pickup times
