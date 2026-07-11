// Pin to commit SHA so GitHub raw serves the exact deploy (update on each push).
const DEPLOY_SHA = "5e5eae4f15270afe369affb44d0939bdff475ded";
const UPSTREAM_LIVE = `https://raw.githubusercontent.com/LitKanna/Markett/${DEPLOY_SHA}`;
const UPSTREAM_ASSETS = `https://raw.githubusercontent.com/LitKanna/Markett/${DEPLOY_SHA}`;

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  woff2: "font/woff2",
  woff: "font/woff",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  json: "application/json",
  md: "text/plain; charset=utf-8",
};

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_SETTINGS = {
  prices: { tray1: 12, tray2: 23, box: 66 },
  traysAvailable: 24,
  trayWeight: "1.75",
  pickup: {
    Monday: { enabled: false, open: "09:00", close: "14:00" },
    Tuesday: { enabled: false, open: "09:00", close: "14:00" },
    Wednesday: { enabled: false, open: "09:00", close: "14:00" },
    Thursday: { enabled: false, open: "09:00", close: "14:00" },
    Friday: { enabled: true, open: "10:00", close: "16:30" },
    Saturday: { enabled: true, open: "06:00", close: "14:00" },
    Sunday: { enabled: false, open: "09:00", close: "14:00" },
  },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanPickupDay(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback.enabled,
    open: TIME_RE.test(input.open) ? input.open : fallback.open,
    close: TIME_RE.test(input.close) ? input.close : fallback.close,
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function isAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return env.ADMIN_KEY && auth === `Bearer ${env.ADMIN_KEY}`;
}

function clientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    ""
  );
}

function clientMeta(request) {
  const cf = request.cf || {};
  const ua = String(request.headers.get("User-Agent") || "").slice(0, 160);
  return {
    country: String(cf.country || request.headers.get("CF-IPCountry") || "").toUpperCase() || null,
    asnOrg: String(cf.asOrganization || "").slice(0, 80) || null,
    colo: String(cf.colo || "").slice(0, 8) || null,
    ua: ua || null,
  };
}

// Rolling-window rate limit stored in KV. Returns true if the request is allowed.
async function allowRate(env, key, limit, windowSec) {
  const id = `rl:${key}`;
  const now = Date.now();
  const data = (await env.DATA.get(id, "json")) || { hits: [] };
  const hits = (Array.isArray(data.hits) ? data.hits : []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= limit) return false;
  hits.push(now);
  await env.DATA.put(id, JSON.stringify({ hits }), { expirationTtl: windowSec + 120 });
  return true;
}

// How many physical trays an order consumes
function traysFor(order) {
  const perUnit = order.bundle === "box" ? 6 : order.bundle === "tray2" ? 2 : 1;
  return perUnit * (order.quantity || 1);
}

// Reserve or release stock as an order moves through statuses.
// Confirmed and done orders hold stock; new and cancelled do not.
async function syncStock(env, order, newStatus) {
  const holds = ["confirmed", "done"].includes(newStatus);
  let delta = 0;

  if (holds && !order.stockTaken) {
    delta = -traysFor(order);
    order.stockTaken = true;
  } else if (!holds && order.stockTaken) {
    delta = traysFor(order);
    order.stockTaken = false;
  }

  if (delta !== 0) {
    const settings = await getSettings(env);
    settings.traysAvailable = Math.max(0, settings.traysAvailable + delta);
    await env.DATA.put("settings", JSON.stringify(settings));
    return { delta, traysAvailable: settings.traysAvailable };
  }
  return { delta: 0, traysAvailable: (await getSettings(env)).traysAvailable };
}

async function getSettings(env) {
  const stored = (await env.DATA.get("settings", "json")) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    prices: { ...DEFAULT_SETTINGS.prices, ...(stored.prices || {}) },
    pickup: Object.fromEntries(
      WEEK_DAYS.map((d) => [d, cleanPickupDay((stored.pickup || {})[d], DEFAULT_SETTINGS.pickup[d])])
    ),
  };
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Public: current prices and stock
  if (url.pathname === "/api/settings" && request.method === "GET") {
    return json(await getSettings(env));
  }

  // Admin: update prices and stock
  if (url.pathname === "/api/settings" && request.method === "PUT") {
    if (!isAdmin(request, env)) return json({ error: "unauthorised" }, 401);
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "bad json" }, 400);

    const current = await getSettings(env);
    const next = {
      prices: {
        tray1: Number(body?.prices?.tray1) || current.prices.tray1,
        tray2: Number(body?.prices?.tray2) || current.prices.tray2,
        box: Number(body?.prices?.box) || current.prices.box,
      },
      traysAvailable: Number.isFinite(Number(body?.traysAvailable))
        ? Math.max(0, Math.floor(Number(body.traysAvailable)))
        : current.traysAvailable,
      trayWeight: ["1.5", "1.75", "fr-700", "fr-600"].includes(body?.trayWeight)
        ? body.trayWeight
        : current.trayWeight,
      pickup: Object.fromEntries(
        WEEK_DAYS.map((d) => [d, cleanPickupDay((body?.pickup || {})[d], current.pickup[d])])
      ),
    };
    await env.DATA.put("settings", JSON.stringify(next));
    return json(next);
  }

  // Public: place an order
  if (url.pathname === "/api/orders" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const name = String(body?.name || "").trim().slice(0, 80);
    const phone = String(body?.phone || "").replace(/\D/g, "").slice(0, 12);
    const bundle = ["tray1", "tray2", "box"].includes(body?.bundle) ? body.bundle : null;
    const pickupDay = WEEK_DAYS.includes(body?.pickupDay) ? body.pickupDay : null;
    const quantity = Math.min(20, Math.max(1, Math.floor(Number(body?.quantity)) || 1));
    const pickupDate = String(body?.pickupDate || "").replace(/[^0-9A-Za-z ]/g, "").slice(0, 12);
    // Honeypot: bots fill hidden "company" field — pretend success, save nothing.
    const honeypot = String(body?.company || "").trim();
    if (honeypot) {
      return json({ ok: true, id: `order:blocked:${Date.now()}` });
    }

    if (!name || !/^04\d{8}$/.test(phone) || !bundle || !pickupDay) {
      return json({ error: "invalid order" }, 400);
    }

    const settings = await getSettings(env);
    if (!settings.pickup[pickupDay]?.enabled) {
      return json({ error: "pickup day unavailable" }, 400);
    }

    const ip = clientIp(request);
    const meta = clientMeta(request);
    // Soft anti-spam: cap bookings per IP and per phone in a rolling window.
    if (ip && !(await allowRate(env, `ip:${ip}`, 5, 24 * 3600))) {
      return json({ error: "too many orders", code: "rate_ip" }, 429);
    }
    if (!(await allowRate(env, `phone:${phone}`, 3, 24 * 3600))) {
      return json({ error: "too many orders", code: "rate_phone" }, 429);
    }

    const now = new Date();
    const id = `order:${now.toISOString()}:${Math.random().toString(36).slice(2, 8)}`;
    const order = {
      id,
      name,
      phone,
      bundle,
      quantity,
      pickupDay,
      pickupDate,
      price: settings.prices[bundle] * quantity,
      status: "new",
      createdAt: now.toISOString(),
      ip: ip || null,
      country: meta.country,
      asnOrg: meta.asnOrg,
      colo: meta.colo,
      ua: meta.ua,
    };
    await env.DATA.put(id, JSON.stringify(order));
    return json({ ok: true, id });
  }

  // Admin: list orders, newest first
  if (url.pathname === "/api/orders" && request.method === "GET") {
    if (!isAdmin(request, env)) return json({ error: "unauthorised" }, 401);
    const list = await env.DATA.list({ prefix: "order:", limit: 500 });
    const orders = await Promise.all(list.keys.map((k) => env.DATA.get(k.name, "json")));
    const valid = orders.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ orders: valid });
  }

  // Public: create a locked-amount Stripe checkout for an existing order
  if (url.pathname === "/api/checkout" && request.method === "POST") {
    if (!env.STRIPE_KEY) return json({ error: "payments not configured" }, 503);
    const body = await request.json().catch(() => null);
    const orderId = String(body?.orderId || "");
    if (!orderId.startsWith("order:")) return json({ error: "bad order" }, 400);

    const order = await env.DATA.get(orderId, "json");
    if (!order) return json({ error: "order not found" }, 404);
    if (order.paymentStatus === "paid") return json({ error: "already paid" }, 400);

    const quantity = order.quantity || 1;
    const unitAmount = Math.round((order.price / quantity) * 100);
    const labels = { tray1: "Egg tray (30 eggs)", tray2: "2 egg trays (60 eggs)", box: "Full box (180 eggs)" };

    const params = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "aud",
      "line_items[0][price_data][product_data][name]": labels[order.bundle] || "Eggs",
      "line_items[0][price_data][product_data][description]": `Pickup ${order.pickupDay}${order.pickupDate ? " " + order.pickupDate : ""} at Paddy's Markets Flemington`,
      "line_items[0][price_data][unit_amount]": String(unitAmount),
      "line_items[0][quantity]": String(quantity),
      "metadata[orderId]": orderId,
      success_url: "https://getyolko.com/?paid={CHECKOUT_SESSION_ID}",
      cancel_url: "https://getyolko.com/#order",
    });

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await resp.json();
    if (!session.url) return json({ error: "checkout failed" }, 502);

    order.paymentStatus = "pending";
    order.sessionId = session.id;
    await env.DATA.put(orderId, JSON.stringify(order));
    return json({ url: session.url });
  }

  // Public: confirm payment after returning from Stripe
  if (url.pathname === "/api/confirm-payment" && request.method === "GET") {
    if (!env.STRIPE_KEY) return json({ error: "payments not configured" }, 503);
    const sid = url.searchParams.get("session") || "";
    if (!sid.startsWith("cs_")) return json({ error: "bad session" }, 400);

    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_KEY}` },
    });
    const session = await resp.json();
    const orderId = session?.metadata?.orderId;
    const paid = session?.payment_status === "paid";

    if (paid && orderId) {
      const order = await env.DATA.get(orderId, "json");
      if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "paid";
        if (order.status === "new") order.status = "confirmed";
        await syncStock(env, order, order.status);
        await env.DATA.put(orderId, JSON.stringify(order));
      }
    }
    return json({ paid });
  }

  // Admin: update order status
  if (url.pathname === "/api/order-status" && request.method === "POST") {
    if (!isAdmin(request, env)) return json({ error: "unauthorised" }, 401);
    const body = await request.json().catch(() => null);
    const id = String(body?.id || "");
    const status = ["new", "confirmed", "done", "cancelled"].includes(body?.status) ? body.status : null;
    if (!id.startsWith("order:") || !status) return json({ error: "bad request" }, 400);
    const order = await env.DATA.get(id, "json");
    if (!order) return json({ error: "not found" }, 404);
    const stock = await syncStock(env, order, status);
    order.status = status;
    await env.DATA.put(id, JSON.stringify(order));
    return json({ ok: true, trays: traysFor(order), stockDelta: stock.delta, traysAvailable: stock.traysAvailable });
  }

  return json({ error: "not found" }, 404);
}

const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffd32a">
<title>YOLKO Admin</title>
<link rel="stylesheet" href="/assets/fonts.css?v=76">
<style>
:root {
  --canvas:#f2f0ea; --paper:#fffefb; --ink:#171714; --muted:#6d6b64;
  --line:rgba(23,23,20,.16); --yellow:#ffd32a; --orange:#f6532f;
  --green:#15734c; --green-soft:#e8f3ed; --blue:#1d4f91; --blue-soft:#e2ecf9;
  --red:#b32323; --red-soft:#f7e0dd; --warn:#fff3b0;
  --display:"Bricolage Grotesque","Arial Black",sans-serif;
  --body:"Plus Jakarta Sans",system-ui,sans-serif;
}
*,*::before,*::after { box-sizing:border-box; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
body { margin:0; font-family:var(--body); background:var(--canvas); color:var(--ink); font-size:15px; line-height:1.45; -webkit-font-smoothing:antialiased; }
.wrap { max-width:640px; margin:0 auto; padding:18px 14px 70px; }

@media (min-width:760px) {
  .wrap { max-width:920px; padding:26px 24px 80px; }
  #orders { display:flex; flex-direction:column; gap:0; }
  .stat b { font-size:26px; }
  .card { padding:26px 24px; }
}
@media (min-width:1024px) {
  .wrap { max-width:1200px; padding:32px 28px 90px; }
  .cols { display:grid; grid-template-columns:1.55fr 1fr; gap:18px; align-items:start; }
  .cols > .card { margin-bottom:0; }
  .cols > .card:last-child { position:sticky; top:18px; }
  #orders { display:flex; flex-direction:column; gap:0; }
  .top .brand-name { font-size:28px; }
  h2 { font-size:22px; }
}

.top { display:flex; align-items:center; gap:12px; margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid var(--line); }
.brand { display:inline-flex; align-items:center; gap:10px; text-decoration:none; color:inherit; }
.brand-dot { width:14px; height:14px; border-radius:50%; background:var(--yellow); box-shadow:3px 3px 0 var(--ink); }
.brand-name { font-family:var(--display); font-size:22px; font-weight:800; letter-spacing:-.04em; line-height:1; text-transform:uppercase; }
.top small { display:block; font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--orange); margin-top:4px; }
.top .out { margin-left:auto; }

.card { background:var(--paper); border:1px solid var(--ink); border-radius:0; padding:20px 18px; margin-bottom:16px; box-shadow:6px 6px 0 var(--yellow); }
h2 { font-family:var(--display); font-size:20px; font-weight:800; margin:0 0 14px; letter-spacing:-.03em; text-transform:uppercase; }
.topline { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:4px; }
.topline h2 { margin-bottom:14px; }

.stats { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:16px; }
@media (max-width:640px){ .stats { grid-template-columns:repeat(3,1fr); } }
.stat { background:var(--paper); border:1px solid var(--line); border-radius:0; padding:12px 8px; text-align:center; }
.stat.highlight { background:var(--yellow); border-color:var(--ink); }
.stat.highlight b { color:var(--ink); }
.stat b { display:block; font-family:var(--display); font-size:22px; font-weight:800; letter-spacing:-.03em; }
.stat span { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }

.toast { position:fixed; left:50%; bottom:22px; transform:translate(-50%,16px); z-index:300; max-width:90vw; padding:12px 18px; background:var(--ink); color:var(--paper); font-weight:700; font-size:13.5px; border-radius:0; box-shadow:6px 6px 0 var(--yellow); opacity:0; transition:opacity .3s ease, transform .3s ease; }
.toast.show { opacity:1; transform:translate(-50%,0); }

.orders-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px; }
.filter-chip {
  min-height:36px; padding:0 12px; border:1px solid var(--line); background:var(--paper); color:var(--muted);
  font:inherit; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:.04em; cursor:pointer;
}
.filter-chip b { font-family:var(--display); margin-left:6px; color:var(--ink); }
.filter-chip.on { background:var(--ink); border-color:var(--ink); color:var(--paper); }
.filter-chip.on b { color:var(--yellow); }
#orders { display:flex; flex-direction:column; gap:0; border-top:1px solid var(--ink); }
.order {
  display:grid; grid-template-columns:1fr auto; gap:8px 16px; align-items:center;
  padding:14px 0; border-bottom:1px solid var(--line); background:transparent; border-left:0; border-right:0; border-radius:0;
}
.order.prio { background:transparent; box-shadow:none; border-bottom-color:var(--ink); }
.order.sus { background:rgba(246,83,47,.04); }
.order.done-row, .order.cancelled-row { opacity:.55; }
.o-main { min-width:0; }
.o-top { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin:0; }
.o-name { font-weight:800; font-size:15px; }
.o-price { font-family:var(--display); font-weight:800; font-size:18px; color:var(--orange); letter-spacing:-.03em; margin-left:auto; }
.o-time { display:none; }
.o-what { font-weight:600; font-size:13px; color:var(--muted); margin:4px 0 0; }
.o-what span { font-weight:600; color:var(--muted); }
.o-tags { display:flex; flex-wrap:wrap; gap:5px; margin:8px 0 0; }
.pill { display:inline-block; padding:3px 8px; border-radius:0; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; border:1px solid transparent; }
.pill.new { background:var(--yellow); color:var(--ink); }
.pill.confirmed { background:var(--blue-soft); color:var(--blue); }
.pill.done { background:var(--green-soft); color:var(--green); }
.pill.cancelled { background:var(--red-soft); color:var(--red); }
.pill.paid { background:var(--ink); color:var(--paper); }
.pill.day { background:transparent; color:var(--ink); border-color:var(--line); }
.pill.warn { background:var(--warn); color:var(--ink); border-color:var(--orange); }
.pill.meta { background:transparent; color:var(--muted); font-weight:700; text-transform:none; letter-spacing:0; }
.o-meta { font-size:11px; color:var(--muted); margin:6px 0 0; word-break:break-all; }
.o-side { display:flex; flex-direction:column; align-items:stretch; gap:6px; min-width:148px; }
.o-actions { display:flex; flex-wrap:wrap; gap:6px; margin:0; }
.o-actions a, .o-actions button { flex:1 1 auto; min-width:0; min-height:36px; padding:7px 10px; font-size:12px; }
.callbtn { min-width:100%; }
@media (max-width:640px) {
  .order { grid-template-columns:1fr; }
  .o-side { min-width:0; }
  .o-price { margin-left:0; }
}

button, .callbtn {
  display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:10px 14px;
  border:1px solid var(--ink); border-radius:0; font:inherit; font-weight:800; font-size:13.5px;
  white-space:nowrap; cursor:pointer; background:var(--ink); color:var(--paper); text-decoration:none;
  transition:transform .15s ease, background .15s ease, color .15s ease;
}
button:active, .callbtn:active { transform:translate(1px,1px); }
button.ghost { background:var(--paper); color:var(--ink); }
button.danger { background:var(--red-soft); color:var(--red); border-color:var(--red); }
.callbtn { background:var(--yellow); color:var(--ink); }
button:not(.ghost):not(.danger):hover { background:var(--orange); border-color:var(--orange); color:#fff; }
.callbtn:hover { background:var(--ink); color:var(--paper); }

label { display:block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:6px; }
input, select {
  width:100%; min-height:48px; padding:10px 13px; border:1px solid var(--ink); border-radius:0;
  font:inherit; font-size:16px; font-weight:600; background:var(--paper); color:var(--ink);
  transition:border-color .15s ease, box-shadow .15s ease;
}
select {
  appearance:none; -webkit-appearance:none; padding-right:40px; cursor:pointer;
  background-image:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="9" viewBox="0 0 14 9"><path d="M1 1.5 7 7.5 13 1.5" fill="none" stroke="%23171714" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter"/></svg>');
  background-repeat:no-repeat; background-position:right 14px center;
}
input[type="time"] { cursor:pointer; }
input:hover, select:hover { border-color:var(--orange); }
input:focus, select:focus { outline:none; border-color:var(--orange); box-shadow:3px 3px 0 var(--yellow); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
.hint { margin:-6px 0 10px; font-size:12.5px; color:var(--muted); }
.day-chips { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:14px; }
.chip {
  min-height:44px; padding:0; border:1px solid var(--line); border-radius:0; background:var(--paper);
  color:var(--muted); font:inherit; font-weight:800; font-size:13px; cursor:pointer; transition:all .15s ease;
}
.chip:hover { border-color:var(--ink); color:var(--ink); }
.chip.on { background:var(--ink); border-color:var(--ink); color:var(--paper); box-shadow:3px 3px 0 var(--yellow); }
.hours-row { display:grid; grid-template-columns:44px 1fr 26px 1fr; gap:8px; align-items:center; margin-bottom:10px; }
.hours-row b { font-size:13.5px; color:var(--orange); }
.hours-row span { text-align:center; font-size:12.5px; color:var(--muted); }
.hours-row select { min-height:44px; }
.hours-empty { margin:4px 0 10px; font-size:13.5px; color:var(--muted); }
.b-sum { font-size:12.5px; font-weight:700; color:var(--muted); }
#buyers { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px; }
.buyer-card { border:1px solid var(--line); border-radius:0; padding:14px 14px 12px; background:var(--paper); }
.bc-top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.b-rank { flex-shrink:0; width:26px; height:26px; display:grid; place-items:center; background:var(--canvas); border:1px solid var(--line); border-radius:0; font-weight:800; font-size:12px; color:var(--muted); }
.b-rank.top { background:var(--yellow); color:var(--ink); border-color:var(--ink); }
.bc-name { flex:1; min-width:0; }
.bc-name b { display:block; font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.b-spend { font-family:var(--display); font-weight:800; font-size:18px; color:var(--orange); }
.bb { display:inline-block; margin-right:4px; padding:2px 7px; border-radius:0; font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
.bb.gold { background:var(--yellow); color:var(--ink); }
.bb.green { background:var(--green-soft); color:var(--green); }
.bb.blue { background:var(--blue-soft); color:var(--blue); }
.spark { display:block; width:100%; height:38px; margin-bottom:10px; }
.bc-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px; }
.bc-grid > div { background:var(--canvas); border:1px solid var(--line); border-radius:0; padding:7px 4px; text-align:center; }
.bc-grid b { display:block; font-size:13.5px; }
.bc-grid span { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
.bc-foot { display:flex; align-items:center; gap:8px; }
.b-insight { flex:1; font-size:11.5px; font-weight:700; padding:6px 9px; border-radius:0; }
.b-insight.warn { background:var(--warn); color:var(--ink); }
.b-insight.due { background:var(--blue-soft); color:var(--blue); }
.b-insight.good { background:var(--green-soft); color:var(--green); }
.b-insight.soft { background:var(--canvas); color:var(--muted); }
.bc-call { flex-shrink:0; padding:6px 14px; background:var(--ink); color:var(--paper); border-radius:0; font-size:12px; font-weight:700; text-decoration:none; border:1px solid var(--ink); }
.dayrow { display:grid; grid-template-columns:96px 1fr 1fr; gap:10px; align-items:end; margin-bottom:12px; }
.chk { display:flex; align-items:center; gap:8px; font-size:14.5px; font-weight:800; text-transform:none; letter-spacing:0; color:var(--ink); padding-bottom:12px; }
.chk input { width:20px; height:20px; min-height:0; accent-color:var(--orange); }
.msg { font-size:13.5px; font-weight:700; margin-left:10px; }
.msg.ok { color:var(--green); } .msg.err { color:var(--red); }
.note { font-size:12.5px; color:var(--muted); margin:12px 0 0; }
.empty { color:var(--muted); text-align:center; padding:24px 0; }
.refresh { width:100%; margin-top:4px; }
.login { max-width:420px; margin:40px auto 0; }
.login h2 { margin-bottom:8px; }
.login-lead { margin:0 0 16px; color:var(--muted); font-size:14px; }
</style>

</head>
<body>
<div class="wrap">
  <div class="top">
    <a class="brand" href="/" aria-label="YOLKO home">
      <span class="brand-dot" aria-hidden="true"></span>
      <span class="brand-name">YOLKO</span>
    </a>
    <div><small>Admin</small></div>
    <button class="ghost out" id="signout" onclick="logout()" style="display:none">Sign out</button>
  </div>

  <div class="card login" id="login-card">
    <h2>Sign in</h2>
    <p class="login-lead">Paste your admin key to manage orders, stock, and pickup hours.</p>
    <label>Admin key</label>
    <input id="key" type="password" placeholder="Paste your admin key" style="margin-bottom:12px">
    <button onclick="saveKey()" style="width:100%">Sign in</button>
    <p class="msg err" id="login-msg" style="margin:10px 0 0; display:block; text-align:center"></p>
  </div>

  <div id="panel" style="display:none">
    <div class="stats" id="stats"></div>

    <div class="cols">
    <div class="col-left">
    <div class="card">
      <div class="topline">
        <h2>Orders</h2>
        <button class="ghost" onclick="loadOrders()" style="min-height:36px;padding:6px 12px;font-size:12px">Refresh</button>
      </div>
      <div class="orders-toolbar" id="order-filters"></div>
      <div id="orders"></div>
      <p class="empty" id="empty" style="display:none">No orders in this view.</p>
    </div>

    <div class="card">
      <div class="topline">
        <h2>Buyers</h2>
        <span class="b-sum" id="buyer-sum"></span>
      </div>
      <div id="buyers"></div>
    </div>
    </div>

    <div class="card">
      <h2>Prices &amp; stock</h2>
      <div class="grid2">
        <div><label>1 tray ($)</label><input id="p1" type="number" min="1" step="0.5"></div>
        <div><label>2 trays ($)</label><input id="p2" type="number" min="1" step="0.5"></div>
        <div><label>Full box ($)</label><input id="p3" type="number" min="1" step="0.5"></div>
        <div><label>Trays available</label><input id="stock" type="number" min="0" step="1"></div>
        <div style="grid-column:1/-1"><label>Product</label>
          <select id="tray-weight">
            <option value="1.75">Cage · 1.75kg (Extra Large)</option>
            <option value="1.5">Cage · 1.5kg (Large)</option>
            <option value="fr-700">Free range · 700g</option>
            <option value="fr-600">Free range · 600g</option>
          </select>
        </div>
      </div>

      <h2 style="margin-top:6px">Pickup days &amp; hours</h2>
      <p class="hint">Tap a day to open or close it</p>
      <div class="day-chips" id="day-chips"></div>
      <div id="day-hours"></div>

      <button onclick="saveSettings()" style="width:100%">Save changes</button><span class="msg" id="save-msg"></span>
      <p class="note">Changes appear on the website within seconds. Untick a day to hide it and block bookings for it.</p>
    </div>
    </div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let KEY = localStorage.getItem("yolko_admin_key") || "";

function describeOrder(bundle, qty) {
  qty = qty || 1;
  if (bundle === "box") return qty === 1 ? "1 box (180 eggs)" : qty + " boxes (" + (180 * qty).toLocaleString() + " eggs)";
  const trays = (bundle === "tray2" ? 2 : 1) * qty;
  return trays === 1 ? "1 tray (30 eggs)" : trays + " trays (" + (30 * trays).toLocaleString() + " eggs)";
}

const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function timeOptions(selected) {
  let out = "";
  for (let h = 5; h <= 21; h++) {
    for (const m of [0, 30]) {
      const val = String(h).padStart(2, "0") + ":" + (m ? "30" : "00");
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const label = h12 + (m ? ":30 " : ":00 ") + (h >= 12 ? "PM" : "AM");
      out += '<option value="' + val + '"' + (val === selected ? " selected" : "") + ">" + label + "</option>";
    }
  }
  return out;
}

let PICKUP = {};

function renderDays() {
  $("day-chips").innerHTML = WEEK_DAYS.map(function(day) {
    const on = PICKUP[day] && PICKUP[day].enabled;
    return '<button type="button" class="chip' + (on ? " on" : "") + '" data-day="' + day + '">' + day.slice(0,3) + '</button>';
  }).join("");

  const open = WEEK_DAYS.filter(function(d) { return PICKUP[d] && PICKUP[d].enabled; });
  $("day-hours").innerHTML = open.length
    ? open.map(function(day) {
        const p = PICKUP[day];
        return '<div class="hours-row">' +
          '<b>' + day.slice(0,3) + '</b>' +
          '<select data-day="' + day + '" data-k="open">' + timeOptions(p.open) + '</select>' +
          '<span>to</span>' +
          '<select data-day="' + day + '" data-k="close">' + timeOptions(p.close) + '</select>' +
        '</div>';
      }).join("")
    : '<p class="hours-empty">No pickup days open. Tap a day above.</p>';
}

$("day-chips") && document.addEventListener("click", function(e) {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const day = chip.dataset.day;
  PICKUP[day] = PICKUP[day] || { enabled: false, open: "09:00", close: "14:00" };
  PICKUP[day].enabled = !PICKUP[day].enabled;
  renderDays();
});

document.addEventListener("change", function(e) {
  const sel = e.target.closest("#day-hours select");
  if (!sel) return;
  PICKUP[sel.dataset.day][sel.dataset.k] = sel.value;
});

function collectDayRows() {
  return PICKUP;
}

function traysFor(o) {
  return (o.bundle === "box" ? 6 : o.bundle === "tray2" ? 2 : 1) * (o.quantity || 1);
}

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 350); }, 3200);
}

function authHeaders() { return { "Authorization": "Bearer " + KEY, "Content-Type": "application/json" }; }

async function saveKey() {
  KEY = $("key").value.trim();
  const res = await fetch("/api/orders", { headers: authHeaders() });
  if (res.ok) {
    localStorage.setItem("yolko_admin_key", KEY);
    $("login-msg").textContent = "";
    boot();
  } else {
    $("login-msg").textContent = "Wrong key, try again";
  }
}

function logout() { localStorage.removeItem("yolko_admin_key"); location.reload(); }

function fmtTime(iso) {
  return new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function fmtPhone(p) { return p.replace(/(\\d{4})(\\d{3})(\\d{3})/, "$1 $2 $3"); }

let ALL_ORDERS = [];
let ORDER_FILTER = localStorage.getItem("yolko_order_filter") || "new";

async function loadOrders() {
  const res = await fetch("/api/orders", { headers: authHeaders() });
  if (!res.ok) return;
  const { orders } = await res.json();

  orders.sort((a, b) => {
    const rank = (o) => {
      if (o.status === "cancelled") return 4;
      if (o.status === "done") return 3;
      if (o.status === "confirmed") return 1;
      return o.paymentStatus === "paid" ? 0 : 2;
    };
    return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
  });
  ALL_ORDERS = orders;

  const active = orders.filter(o => o.status !== "cancelled");
  const revenue = active.filter(o => o.status !== "new").reduce((s, o) => s + (o.price || 0), 0);
  const paidOnline = active.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + (o.price || 0), 0);
  const pending = orders.filter(o => o.status === "new").length;
  $("stats").innerHTML =
    '<div class="stat"><b>' + orders.length + '</b><span>orders</span></div>' +
    '<div class="stat"><b>' + pending + '</b><span>waiting</span></div>' +
    '<div class="stat highlight"><b id="stat-stock">' + (window.TRAYS_LEFT ?? "–") + '</b><span>trays left</span></div>' +
    '<div class="stat"><b>$' + revenue + '</b><span>confirmed</span></div>' +
    '<div class="stat"><b>$' + paidOnline + '</b><span>paid online</span></div>';

  renderOrderFilters();
  renderOrderList();
  renderBuyers(orders);
}

function filterOrders(list, filter) {
  if (filter === "active") return list.filter(o => o.status === "new" || o.status === "confirmed");
  if (filter === "all") return list;
  return list.filter(o => o.status === filter);
}

function renderOrderFilters() {
  const counts = {
    active: ALL_ORDERS.filter(o => o.status === "new" || o.status === "confirmed").length,
    new: ALL_ORDERS.filter(o => o.status === "new").length,
    confirmed: ALL_ORDERS.filter(o => o.status === "confirmed").length,
    done: ALL_ORDERS.filter(o => o.status === "done").length,
    cancelled: ALL_ORDERS.filter(o => o.status === "cancelled").length,
    all: ALL_ORDERS.length,
  };
  const tabs = [
    ["new", "Waiting"],
    ["confirmed", "Confirmed"],
    ["active", "Active"],
    ["done", "Done"],
    ["cancelled", "Cancelled"],
    ["all", "All"],
  ];
  $("order-filters").innerHTML = tabs.map(function(tab) {
    const key = tab[0], label = tab[1];
    return '<button type="button" class="filter-chip' + (ORDER_FILTER === key ? ' on' : '') + '" data-filter="' + key + '">' +
      label + '<b>' + counts[key] + '</b></button>';
  }).join("");
}

document.addEventListener("click", function(e) {
  const chip = e.target.closest("#order-filters .filter-chip");
  if (!chip) return;
  ORDER_FILTER = chip.dataset.filter;
  localStorage.setItem("yolko_order_filter", ORDER_FILTER);
  renderOrderFilters();
  renderOrderList();
});

function renderOrderList() {
  const orders = filterOrders(ALL_ORDERS, ORDER_FILTER);
  $("orders").innerHTML = orders.map(function(o) {
    const prio = o.paymentStatus === "paid" && o.status !== "cancelled";
    const signals = orderSignals(o, ALL_ORDERS);
    const pickup = o.pickupDay + (o.pickupDate ? " " + o.pickupDate : "");
    return '<div class="order' + (prio ? ' prio' : '') + (signals.suspicious ? ' sus' : '') +
      (o.status === "done" ? ' done-row' : '') + (o.status === "cancelled" ? ' cancelled-row' : '') + '">' +
      '<div class="o-main">' +
        '<div class="o-top">' +
          '<span class="pill ' + o.status + '">' + o.status + '</span>' +
          (prio ? '<span class="pill paid">paid</span>' : '') +
          signals.tags.map(function(t) { return '<span class="pill ' + t.cls + '">' + escapeHtml(t.text) + '</span>'; }).join('') +
          '<span class="o-name">' + escapeHtml(o.name) + '</span>' +
          '<span class="o-price">$' + o.price + '</span>' +
        '</div>' +
        '<div class="o-what">' + describeOrder(o.bundle, o.quantity) +
          ' <span>· ' + pickup + ' · ' + fmtTime(o.createdAt) + '</span></div>' +
        (signals.metaLine ? '<div class="o-meta">' + escapeHtml(signals.metaLine) + '</div>' : '') +
      '</div>' +
      '<div class="o-side">' +
        '<a class="callbtn" href="tel:' + o.phone + '">' + fmtPhone(o.phone) + '</a>' +
        '<div class="o-actions">' + actionButtons(o) + '</div>' +
      '</div>' +
    '</div>';
  }).join("");
  $("empty").style.display = orders.length ? "none" : "block";
}

const TEST_PHONES = { "0412345678": 1, "0498765432": 1 };
const HOSTING_RE = /amazon|google|microsoft|digitalocean|ovh|hetzner|linode|vultr|cloudflare|hosting|datacenter|vps|colo/i;

function orderSignals(o, orders) {
  const tags = [];
  let suspicious = false;
  if (o.country && o.country !== "AU") {
    tags.push({ cls: "warn", text: o.country + " IP" });
    suspicious = true;
  }
  if (TEST_PHONES[o.phone]) {
    tags.push({ cls: "warn", text: "test phone?" });
    suspicious = true;
  }
  if (o.asnOrg && HOSTING_RE.test(o.asnOrg)) {
    tags.push({ cls: "warn", text: "datacenter IP" });
    suspicious = true;
  }
  if (o.ip) {
    const same = orders.filter(function(x) {
      return x.ip === o.ip && x.id !== o.id && x.status !== "cancelled";
    }).length;
    if (same > 0) {
      tags.push({ cls: "warn", text: same + " more same IP" });
      suspicious = true;
    }
  }
  const metaParts = [];
  if (o.country) metaParts.push(o.country);
  if (o.ip) metaParts.push(o.ip);
  if (o.asnOrg) metaParts.push(o.asnOrg);
  return { tags: tags, suspicious: suspicious, metaLine: metaParts.join(" · ") };
}

function daysAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
}

function sparkline(history, maxV) {
  // history: [{t, v}] sorted by time; renders an SVG line of purchases
  const W = 100, H = 34, PAD = 5;
  if (!history.length) return "";
  const t0 = history[0].t, t1 = history[history.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const pts = history.map(function(p) {
    const x = history.length === 1 ? W / 2 : PAD + ((p.t - t0) / span) * (W - PAD * 2);
    const y = H - PAD - (p.v / maxV) * (H - PAD * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
  const line = pts.map(function(p) { return p[0] + "," + p[1]; }).join(" ");
  const area = "M" + pts[0][0] + "," + (H - 2) + " L" + pts.map(function(p) { return p[0] + "," + p[1]; }).join(" L") + " L" + pts[pts.length - 1][0] + "," + (H - 2) + " Z";
  const dots = pts.map(function(p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#f6532f"/>'; }).join("");
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + area + '" fill="rgba(255,211,42,.35)"/>' +
    (pts.length > 1 ? '<polyline points="' + line + '" fill="none" stroke="#f6532f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
    dots + '</svg>';
}

function renderBuyers(orders) {
  const active = orders.filter(function(o) { return o.status !== "cancelled"; });
  const map = {};
  active.forEach(function(o) {
    const b = map[o.phone] = map[o.phone] || { name: o.name, phone: o.phone, orders: 0, trays: 0, spend: 0, paid: 0, history: [], bundles: {}, days: {} };
    b.orders++;
    b.trays += traysFor(o);
    b.spend += o.price || 0;
    if (o.paymentStatus === "paid") b.paid++;
    b.history.push({ t: new Date(o.createdAt).getTime(), v: o.price || 0 });
    b.bundles[o.bundle] = (b.bundles[o.bundle] || 0) + 1;
    b.days[o.pickupDay] = (b.days[o.pickupDay] || 0) + 1;
  });

  const buyers = Object.values(map).sort(function(a, b) { return b.spend - a.spend; });
  const repeat = buyers.filter(function(b) { return b.orders > 1; }).length;
  $("buyer-sum").textContent = buyers.length
    ? buyers.length + (buyers.length === 1 ? " buyer" : " buyers") + " · " + repeat + " repeat"
    : "";

  if (!buyers.length) {
    $("buyers").innerHTML = '<p class="empty">No buyers yet. They appear with their first order.</p>';
    return;
  }

  const BUNDLE_WORD = { tray1: "single trays", tray2: "2-tray packs", box: "full boxes" };

  $("buyers").innerHTML = buyers.map(function(b, i) {
    b.history.sort(function(x, y) { return x.t - y.t; });
    const maxOrderV = Math.max.apply(null, b.history.map(function(p) { return p.v; })) || 1;
    const newest = b.history[b.history.length - 1].t;
    const daysSince = Math.max(0, Math.floor((Date.now() - newest) / 86400000));

    const favBundle = Object.keys(b.bundles).sort(function(x, y) { return b.bundles[y] - b.bundles[x]; })[0];
    const favDay = Object.keys(b.days).sort(function(x, y) { return b.days[y] - b.days[x]; })[0];

    let badges = "";
    if (i === 0 && buyers.length > 1) badges += '<span class="bb gold">top</span>';
    if (b.orders >= 3) badges += '<span class="bb green">regular</span>';
    if (b.paid === b.orders && b.orders > 0) badges += '<span class="bb green">prepays</span>';
    if (b.orders === 1 && daysSince <= 10) badges += '<span class="bb blue">new</span>';

    let insight = "", insightClass = "soft";
    if (b.orders > 1) {
      const spanDays = (newest - b.history[0].t) / 86400000;
      const gap = Math.max(1, Math.round(spanDays / (b.orders - 1)));
      const ratio = daysSince / gap;
      if (ratio >= 1.4) { insight = "Overdue " + (daysSince - gap) + "d — worth a WhatsApp"; insightClass = "warn"; }
      else if (ratio >= 0.75) { insight = "Due about now — every ~" + gap + " days"; insightClass = "due"; }
      else { const next = Math.max(1, gap - daysSince); insight = "Next likely in ~" + next + (next === 1 ? " day" : " days"); insightClass = "good"; }
    } else if (daysSince <= 10) { insight = "New — follow up to keep them"; insightClass = "due"; }
    else { insight = "Quiet " + daysSince + "d — send a comeback"; insightClass = "soft"; }

    return '<div class="buyer-card">' +
      '<div class="bc-top">' +
        '<span class="b-rank' + (i === 0 ? " top" : "") + '">' + (i + 1) + '</span>' +
        '<div class="bc-name"><b>' + escapeHtml(b.name) + '</b><div>' + badges + '</div></div>' +
        '<span class="b-spend">$' + b.spend + '</span>' +
      '</div>' +
      sparkline(b.history, maxOrderV) +
      '<div class="bc-grid">' +
        '<div><b>' + b.orders + '</b><span>' + (b.orders === 1 ? "order" : "orders") + '</span></div>' +
        '<div><b>' + b.trays + '</b><span>' + (b.trays === 1 ? "tray" : "trays") + '</span></div>' +
        '<div><b>' + favDay.slice(0, 3) + '</b><span>usual day</span></div>' +
        '<div><b>' + (BUNDLE_WORD[favBundle] || favBundle).split(" ")[0].replace("single", "trays").replace("2-tray", "2-packs") + '</b><span>usually</span></div>' +
      '</div>' +
      '<div class="bc-foot">' +
        '<span class="b-insight ' + insightClass + '">' + insight + '</span>' +
        '<a class="bc-call" href="tel:' + b.phone + '" title="' + fmtPhone(b.phone) + '">Call</a>' +
      '</div>' +
    '</div>';
  }).join("");
}

function actionButtons(o) {
  const btn = (status, label, cls) => '<button class="' + cls + '" onclick="setStatus(\\'' + o.id + '\\',\\'' + status + '\\')">' + label + '</button>';
  if (o.status === "new") return btn("confirmed", "Confirm", "") + btn("cancelled", "Cancel", "danger");
  if (o.status === "confirmed") return btn("done", "Picked up", "") + btn("new", "Unconfirm", "ghost") + btn("cancelled", "Cancel", "danger");
  if (o.status === "done") return btn("confirmed", "Undo pickup", "ghost") + btn("cancelled", "Cancel", "danger");
  return btn("new", "Reopen", "ghost");
}

async function setStatus(id, status) {
  const res = await fetch("/api/order-status", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id, status }) });
  if (res.ok) {
    const d = await res.json();
    if (typeof d.traysAvailable === "number") {
      window.TRAYS_LEFT = d.traysAvailable;
      $("stock").value = d.traysAvailable;
      const stat = $("stat-stock");
      if (stat) stat.textContent = d.traysAvailable;
      if (d.stockDelta < 0) toast(d.trays + (d.trays === 1 ? " tray" : " trays") + " allocated · " + d.traysAvailable + " left");
      if (d.stockDelta > 0) toast(d.stockDelta + (d.stockDelta === 1 ? " tray" : " trays") + " returned · " + d.traysAvailable + " left");
    }
  }
  loadOrders();
}

async function loadSettings() {
  const res = await fetch("/api/settings");
  const s = await res.json();
  $("p1").value = s.prices.tray1;
  $("p2").value = s.prices.tray2;
  $("p3").value = s.prices.box;
  $("stock").value = s.traysAvailable;
  window.TRAYS_LEFT = s.traysAvailable;
  const stat = $("stat-stock");
  if (stat) stat.textContent = s.traysAvailable;
  $("tray-weight").value = s.trayWeight || "1.75";
  PICKUP = s.pickup || {};
  renderDays();
}

async function saveSettings() {
  const body = {
    prices: { tray1: +$("p1").value, tray2: +$("p2").value, box: +$("p3").value },
    traysAvailable: +$("stock").value,
    trayWeight: $("tray-weight").value,
    pickup: collectDayRows(),
  };
  const res = await fetch("/api/settings", { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
  const el = $("save-msg");
  el.textContent = res.ok ? "Saved, live now" : "Failed";
  el.className = "msg " + (res.ok ? "ok" : "err");
  setTimeout(() => { el.textContent = ""; }, 2500);
}

function escapeHtml(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }

async function boot() {
  const res = await fetch("/api/orders", { headers: authHeaders() });
  if (!res.ok) return;
  $("login-card").style.display = "none";
  $("panel").style.display = "block";
  $("signout").style.display = "inline-flex";
  loadSettings();
  loadOrders();
  setInterval(loadOrders, 30000);
}

if (KEY) boot();
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical: force https and apex host in production, but keep
    // `wrangler dev` usable over its local HTTP server.
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocal && (url.protocol === "http:" || url.hostname.startsWith("www."))) {
      url.protocol = "https:";
      if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return new Response(ADMIN_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex",
          "Cache-Control": "no-store, max-age=0",
          "X-Yolko-Admin": "80",
        },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    let path = url.pathname;
    if (path === "/" || path === "") path = "/index.html";
    const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "html";
    if (!path.includes(".")) path += ".html";

    const live = ext === "html" || ext === "css" || ext === "js";
    const upstreamBase = live ? UPSTREAM_LIVE : UPSTREAM_ASSETS;
    const bust = live ? `?_${Date.now()}` : "";
    const upstreamResp = await fetch(upstreamBase + path + bust, {
      headers: { "User-Agent": "yolko-edge" },
      cf: { cacheTtl: 0 },
    });

    if (!upstreamResp.ok) {
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    return new Response(upstreamResp.body, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=60, must-revalidate",
        "X-Yolko-Build": "77",
      },
    });
  },
};
