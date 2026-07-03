# Setup Guide — Payments, WhatsApp, and Ad Accounts

## 1. Stripe online payments (15 minutes)

The website is already wired for Stripe Payment Links. No code needed.

1. Create an account at https://stripe.com (free, needs your ID and bank details)
2. In the Stripe Dashboard go to **Payment Links → New**
3. Create three links:
   - "Egg tray (30 eggs)" — $12 AUD
   - "2 egg trays (60 eggs)" — $23 AUD
   - "Full box (180 eggs)" — $66 AUD
4. Copy each link into `config.js`:

```js
stripeLinks: {
  tray1: "https://buy.stripe.com/...",
  tray2: "https://buy.stripe.com/...",
  box:   "https://buy.stripe.com/...",
},
```

5. Commit and push — a "Pay online now" button appears automatically after
   each booking.

Stripe takes about 1.7% + 30c per transaction. On a $12 tray that is ~50c,
so consider online payment mainly for 2-tray and box orders.

## 2. WhatsApp booking button (2 minutes)

In `config.js` set your number in international format, digits only:

```js
whatsappNumber: "61412345678",  // 0412 345 678 becomes 61412345678
```

After each booking the customer gets a one-tap "Send via WhatsApp" button
with the full order pre-typed.

## 3. Weekly stock counter

```js
traysAvailableThisWeek: 24,
```

Shows "Only 24 trays available this week" under the prices. Update weekly.

## 4. Connecting ad accounts — do this safely

**Never share your Facebook, Instagram, or Google passwords with anyone —
including any AI tool or person.** That is how accounts get stolen.

The safe way to run ads:

1. **Meta (Facebook + Instagram):** create the ads yourself in Ads Manager
   using `ads/facebook-instagram-ads.md` — everything is pre-written to paste.
   If you later want programmatic posting, create a Meta Developer app and a
   *limited* access token, and add it as a secret in the Cursor Dashboard
   (Cloud Agents → Secrets) — never paste tokens into chat.
2. **Google:** use `ads/google-ads.md` the same way. Google Ads also has an
   API, but the paste-in campaign takes ~10 minutes and is enough at this size.

## 5. Launch order (what to do first)

1. Set your WhatsApp number in `config.js` — free, biggest impact
2. Create the free Google Business Profile — free traffic from Maps
3. Post in local Facebook groups Wednesday/Thursday — free
4. Start Meta ads at $7–10/day — first paid channel
5. Add Google Search ads once Meta ads are profitable
6. Add Stripe links when you want prepaid orders
