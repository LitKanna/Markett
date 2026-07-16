# Facebook + Instagram Ads — live Sales structure

Ad account: `act_1940573363326611` · Pixel: `2008953469766472` (YOLKO) · Page: YOLKO

Rebuild / refresh via API:

```bash
META_ACCESS_TOKEN=... META_ACTIVATE=1 node infra/meta-sales-rebuild.mjs
```

Ads Manager:
https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1940573363326611&selected_campaign_ids=120251266112440131

## Live structure (do not explode into suburb campaigns)

| Level | Name | Notes |
|---|---|---|
| Campaign | **YOLKO — Sales (Purchase)** | `OUTCOME_SALES` · Purchase · **$14/day** |
| Ad set | **Cold — Markets 50km · Purchase** | Hub lat/lng Sydney Markets · **50 km** · age 25–55 |
| Ads | **Ad · Price $13** · **Ad · Sat delivery +$5** · **Ad · 2 trays $25** | ACTIVE |
| Ad set | **Retarget — Site visitors 14d** | Custom audience (YOLKO pixel, 14d) |
| Ad | **Ad · Retarget Price $13** | ACTIVE |
| Legacy | New Sales Ad | **PAUSED** |

**Sold-out auto-pause:** Worker secret `META_ADSET_IDS` lists both ad sets; when `traysAvailable` hits 0 they pause (and resume only if we paused them).

## Why this shape

- One Purchase campaign beats Traffic + suburb spam.
- Meta finds converters inside the 50 km circle (don’t make 80 suburb ad sets).
- Retargeting spends on people who already saw getyolko.com.
- Pixel + CAPI Purchase events feed optimisation (wired on the site/worker).

## Creative copy (live)

### Ad · Price $13
30 XL fresh eggs for $13 — that's about 43¢ an egg.

Book online, pick up Friday 2–4pm or Saturday 5–8am at Paddy's Markets Flemington.
Pay online to lock them in, or pay at pickup.

**Headline:** 30 Eggs $13 · Book pickup Fri/Sat  
**Description:** Paddy's Markets Flemington

### Ad · Sat delivery +$5
Can't make the market? We deliver Saturday for +$5 within 45 km of Sydney Markets.

30 eggs $13 · 2 trays $25 · full box $72.
Book on getyolko.com — packed fresh for your suburb.

**Headline:** Sat delivery +$5 · Book online  
**Description:** Within 45 km of Sydney Markets

### Ad · 2 trays $25
Feeding the family? Grab 2 trays — 60 fresh Pace Farm eggs for $25.

Book pickup Fri/Sat at Flemington, or Saturday delivery +$5.

**Headline:** 60 eggs $25 · 2 trays  
**Description:** Flemington pickup or Sat delivery

## Weekly ops

1. Check **cost per Purchase**, not impressions.
2. Pause the weakest cold ad after enough spend; keep winners.
3. Don’t add suburb campaigns.
4. If Custom Audience TOS / app Live ever blocks API again, accept TOS in Ads Manager and keep the developer app **Published**.
