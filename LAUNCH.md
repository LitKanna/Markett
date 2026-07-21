# YOLKO Launch Plan

Your live website: **https://getyolko.com/**

## Before you post anything (30 minutes, one time)

### 1. Connect WhatsApp (most important, 2 minutes)

Bookings currently rely on customers copying a message. Add your number so
they get a one-tap "Confirm on WhatsApp" button instead.

Edit `config.js` on GitHub (repo > config.js > pencil icon):

```js
whatsappNumber: "614XXXXXXXX",   // your 04XX XXX XXX with 61 in front, no +
```

Commit the change; the site updates itself in about a minute.

### 2. Check NSW compliance

- You are reselling stamped, sealed Pace Farm trays: keep them sealed and
  labelled, stored out of heat, no cracked eggs
- Confirm with NSW Food Authority (1300 552 406) whether your resale setup
  needs a food business notification
- Confirm you are allowed to hand over trays at/near Paddy's (stall holders
  and market management have rules about selling on site)

### 3. Set this week's stock

In `config.js`, set how many trays you actually have:

```js
traysAvailableThisWeek: 24,
```

## Launch day: copy-paste posts

### Facebook groups (Flemington, Homebush, Strathfield, Lidcombe, Auburn)

> Fresh eggs at Flemington Markets this Friday and Saturday.
> Pace Farm 30-egg tray for $12 (2 trays $23, full box of 180 for $66).
> Book online in 30 seconds and pick up at Paddy's Markets Flemington.
> https://getyolko.com/
> Limited trays each week.

Post in 2-3 groups per day, not all at once. Reply to every comment.

### Facebook Marketplace listing

- Title: 30 Fresh Eggs $12 - Pickup Flemington Markets Fri/Sat
- Category: Food & Drink
- Photo: a real photo of your actual trays (always beats stock images)
- Description: same text as the group post

### Instagram (post + story)

Caption:

> 30 eggs. $12. Flemington Markets.
> Book online, pick up Friday or Saturday.
> Link in bio.
> #FlemingtonMarkets #SydneyEggs #HomebushWest #Strathfield #SupportLocal #SydneyFood #EggsSydney

Bio link: https://getyolko.com/

### WhatsApp status + broadcast

> Eggs this Friday & Saturday at Flemington Markets. 30-egg tray $12.
> Book here: https://getyolko.com/

## Weekly rhythm (1 hour per week)

| Day | Action |
|-----|--------|
| Wednesday | Update `traysAvailableThisWeek`, post in FB groups |
| Thursday | Instagram post + story, WhatsApp broadcast to past buyers |
| Friday 7 AM | Story: "Pickup today until 4:30" |
| Saturday 6 AM | Story: "Last pickup day this week" |
| Saturday night | Message everyone who bought: "Want me to save you a tray next week?" |

## Week 2+ (only after first sales)

1. Google Business Profile (free, business.google.com) - see `ads/google-ads.md`
2. Meta ads $7-10/day - see `ads/facebook-instagram-ads.md`
3. Stripe payment links for prepaid orders - see `ads/setup-guide.md`
4. Custom domain (optional, ~$15/year): buy yolko.com.au at a registrar,
   add it in repo Settings > Pages > Custom domain

## Rules of thumb

- Real photos of your real trays outperform everything
- Reply to messages within the hour; speed wins repeat buyers
- Collect every buyer's number with permission - the WhatsApp list is the business
- Do not spam groups; twice a week per group maximum
- You write every ad hook (founder = marketing until sell-outs are routine)
- Tell the truth: small stock, pickup only — that scarcity is an asset
- Optimize for weekly repeat buyers (LTV), not forever-cheaper Meta leads

## Growth system (from the transcript playbook)

Full map: `growth-playbook.md`. Short version:

1. **One need-to-believe** — book a $12 Pace Farm tray, pick up Fri/Sat at Flemington
2. **Free lead magnet** — “7 breakfasts from one tray” on the site after booking
3. **LTV** — tick “every week” on the form; Saturday night ask every buyer to renew
4. **Partner peel** — cafés/groceries sell a 3-tray pack and keep 100% of that sale
5. **Pre > post** — lock the hook from `ads/facebook-instagram-ads.md` before you shoot
6. **Split tests** — offer → headline → image → Reserve vs Buy now; lock winners

### Partner pitch (copy-paste)

> Sell a 3-tray starter pack to your customers for at least $36. You keep every
> dollar. We hold the trays for Friday/Saturday pickup at Flemington. No 20%
> referral fee — you keep 100% of that pack. Message us via getyolko.com.

Pitch 2 nearby food businesses a month before chasing influencers.

### #1 question (use monthly)

What would it take for YOLKO to be the default Flemington egg booking for
Homebush / Strathfield / Lidcombe / Auburn? Put resources only into the 1–2
answers (usually: WhatsApp regulars + partner nodes + true sell-out scarcity).
