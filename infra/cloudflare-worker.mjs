// Pin to commit SHA so GitHub raw serves the exact deploy (update on each push).
const DEPLOY_SHA = "379c9cd2caf98bbeb3f41338bd852c757741b698";
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
      trayWeight: ["1.5", "1.75"].includes(body?.trayWeight) ? body.trayWeight : current.trayWeight,
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

    if (!name || !/^04\d{8}$/.test(phone) || !bundle || !pickupDay) {
      return json({ error: "invalid order" }, 400);
    }

    const settings = await getSettings(env);
    if (!settings.pickup[pickupDay]?.enabled) {
      return json({ error: "pickup day unavailable" }, 400);
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
<meta name="theme-color" content="#fdf8ef">
<title>YOLKO Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root { --cream:#fdf8ef; --cream2:#f7efdf; --ink:#241407; --soft:#6b5949; --line:#ecdfc8; --amber:#d97a29; --amber-d:#b05f17; --yolk:#f6b52b; --green:#3c6e4f; --green-soft:#e7f2ea; --blue:#1d4f91; --blue-soft:#e2ecf9; --red:#c0392b; --red-soft:#f7e0dd; }
* { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
body { margin:0; font-family:"Plus Jakarta Sans",system-ui,sans-serif; background:var(--cream); color:var(--ink); font-size:15px; }
.wrap { max-width:640px; margin:0 auto; padding:18px 14px 70px; }

/* iPad: wider canvas, orders flow in two columns */
@media (min-width:760px) {
  .wrap { max-width:920px; padding:26px 24px 80px; }
  #orders { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
  .stat b { font-size:24px; }
  .card { padding:26px 24px; }
}

/* Desktop: dashboard layout, orders left, settings pinned right */
@media (min-width:1024px) {
  .wrap { max-width:1200px; padding:32px 28px 90px; }
  .cols { display:grid; grid-template-columns:1.55fr 1fr; gap:18px; align-items:start; }
  .cols > .card { margin-bottom:0; }
  .cols > .card:last-child { position:sticky; top:18px; }
  #orders { grid-template-columns:repeat(auto-fill, minmax(265px,1fr)); }
  .top h1 { font-size:26px; }
  h2 { font-size:21px; }
}

.top { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
.top svg { flex-shrink:0; }
.top h1 { font-family:"Bricolage Grotesque",sans-serif; font-size:22px; font-weight:800; letter-spacing:.06em; margin:0; line-height:1; }
.top small { display:block; font-size:9.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--amber-d); margin-top:3px; }
.top .out { margin-left:auto; }

.card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:20px 18px; margin-bottom:16px; box-shadow:0 1px 2px rgba(36,20,7,.04), 0 10px 28px rgba(36,20,7,.06); }
h2 { font-family:"Bricolage Grotesque",sans-serif; font-size:19px; font-weight:800; margin:0 0 14px; letter-spacing:-.01em; }

.stats { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:16px; }
@media (max-width:640px){ .stats { grid-template-columns:repeat(3,1fr); } }
.stat.highlight { background:#e7f2ea; }
.stat.highlight b { color:var(--green); }
.toast { position:fixed; left:50%; bottom:22px; transform:translate(-50%,16px); z-index:300; max-width:90vw; padding:12px 20px; background:var(--green); color:#fff; font-weight:700; font-size:13.5px; border-radius:12px; box-shadow:0 14px 36px rgba(36,20,7,.3); opacity:0; transition:opacity .3s ease, transform .3s ease; }
.toast.show { opacity:1; transform:translate(-50%,0); }
.stat { background:var(--cream2); border-radius:14px; padding:10px 8px; text-align:center; }
.stat b { display:block; font-family:"Bricolage Grotesque",sans-serif; font-size:20px; font-weight:800; }
.stat span { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--soft); }

.order { border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:10px; }
.order.prio { background:#f6fbf4; border-color:#cfe5d3; }
.o-top { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
.o-name { font-weight:800; font-size:16px; }
.o-price { font-family:"Bricolage Grotesque",sans-serif; font-weight:800; font-size:20px; color:var(--amber-d); }
.o-time { font-size:12px; color:var(--soft); margin:2px 0 8px; }
.o-what { font-weight:700; font-size:14.5px; margin-bottom:10px; }
.o-what span { font-weight:600; color:var(--soft); }
.o-tags { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.pill { display:inline-block; padding:4px 11px; border-radius:999px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
.pill.new { background:#fdeecd; color:var(--amber-d); }
.pill.confirmed { background:var(--blue-soft); color:var(--blue); }
.pill.done { background:var(--green-soft); color:var(--green); }
.pill.cancelled { background:var(--red-soft); color:var(--red); }
.pill.paid { background:var(--green); color:#fff; }
.pill.day { background:var(--cream2); color:var(--ink); }
.o-actions { display:flex; flex-wrap:wrap; gap:8px; }
.o-actions a, .o-actions button { flex:1 1 auto; min-width:0; }

button, .callbtn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:9px 14px; border:0; border-radius:999px; font:inherit; font-weight:700; font-size:13.5px; white-space:nowrap; cursor:pointer; background:var(--amber); color:#fff; text-decoration:none; transition:transform .15s ease; }
button:active, .callbtn:active { transform:scale(.97); }
button.ghost { background:var(--cream2); color:var(--ink); }
button.danger { background:var(--red-soft); color:var(--red); }
.callbtn { background:var(--ink); color:var(--cream); }

label { display:block; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--soft); margin-bottom:5px; }
input, select { width:100%; min-height:46px; padding:10px 13px; border:2px solid var(--line); border-radius:12px; font:inherit; font-size:16px; font-weight:600; background:var(--cream); color:var(--ink); transition:border-color .15s ease, background .15s ease; }
select { appearance:none; -webkit-appearance:none; padding-right:40px; cursor:pointer; background-image:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="9" viewBox="0 0 14 9"><path d="M1 1.5 7 7.5 13 1.5" fill="none" stroke="%23b05f17" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'); background-repeat:no-repeat; background-position:right 14px center; }
input[type="time"] { cursor:pointer; }
input:hover, select:hover { border-color:#e0cfae; }
input:focus, select:focus { outline:none; border-color:var(--yolk); background:#fff; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
.hint { margin:-6px 0 10px; font-size:12.5px; color:var(--soft); }
.day-chips { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:14px; }
.chip { min-height:44px; padding:0; border:2px solid var(--line); border-radius:12px; background:var(--cream2); color:var(--soft); font:inherit; font-weight:800; font-size:13px; cursor:pointer; transition:all .18s ease; }
.chip:hover { border-color:var(--yolk); color:var(--ink); }
.chip.on { background:var(--amber); border-color:var(--amber); color:#fff; box-shadow:0 4px 12px rgba(217,122,41,.3); }
.hours-row { display:grid; grid-template-columns:44px 1fr 26px 1fr; gap:8px; align-items:center; margin-bottom:10px; }
.hours-row b { font-size:13.5px; color:var(--amber-d); }
.hours-row span { text-align:center; font-size:12.5px; color:var(--soft); }
.hours-row select { min-height:44px; }
.hours-empty { margin:4px 0 10px; font-size:13.5px; color:var(--soft); }
.b-sum { font-size:12.5px; font-weight:700; color:var(--soft); }
#buyers { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px; }
.buyer-card { border:1px solid var(--line); border-radius:14px; padding:14px 14px 12px; background:#fff; }
.bc-top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.b-rank { flex-shrink:0; width:26px; height:26px; display:grid; place-items:center; background:var(--cream2); border-radius:50%; font-weight:800; font-size:12px; color:var(--soft); }
.b-rank.top { background:var(--yolk); color:var(--ink); }
.bc-name { flex:1; min-width:0; }
.bc-name b { display:block; font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.b-spend { font-family:"Bricolage Grotesque",sans-serif; font-weight:800; font-size:18px; color:var(--amber-d); }
.bb { display:inline-block; margin-right:4px; padding:1px 7px; border-radius:999px; font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
.bb.gold { background:#fdeecd; color:var(--amber-d); }
.bb.green { background:var(--green-soft); color:var(--green); }
.bb.blue { background:var(--blue-soft); color:var(--blue); }
.spark { display:block; width:100%; height:38px; margin-bottom:10px; }
.bc-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px; }
.bc-grid > div { background:var(--cream2); border-radius:10px; padding:7px 4px; text-align:center; }
.bc-grid b { display:block; font-size:13.5px; }
.bc-grid span { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--soft); }
.bc-foot { display:flex; align-items:center; gap:8px; }
.b-insight { flex:1; font-size:11.5px; font-weight:700; padding:6px 9px; border-radius:8px; }
.b-insight.warn { background:#fdeecd; color:var(--amber-d); }
.b-insight.due { background:var(--blue-soft); color:var(--blue); }
.b-insight.good { background:var(--green-soft); color:var(--green); }
.b-insight.soft { background:var(--cream2); color:var(--soft); }
.bc-call { flex-shrink:0; padding:6px 14px; background:var(--ink); color:var(--cream); border-radius:999px; font-size:12px; font-weight:700; text-decoration:none; }
.dayrow { display:grid; grid-template-columns:96px 1fr 1fr; gap:10px; align-items:end; margin-bottom:12px; }
.chk { display:flex; align-items:center; gap:8px; font-size:14.5px; font-weight:800; text-transform:none; letter-spacing:0; color:var(--ink); padding-bottom:12px; }
.chk input { width:20px; height:20px; min-height:0; accent-color:var(--amber); }
.msg { font-size:13.5px; font-weight:700; margin-left:10px; }
.msg.ok { color:var(--green); } .msg.err { color:var(--red); }
.note { font-size:12.5px; color:var(--soft); margin:12px 0 0; }
.empty { color:var(--soft); text-align:center; padding:24px 0; }
.refresh { width:100%; margin-top:4px; }
.login { max-width:420px; margin:40px auto 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <svg viewBox="0 0 32 40" width="24" height="30" aria-hidden="true"><path d="M16 2C9 2 2 16 2 26a14 14 0 0 0 28 0C30 16 23 2 16 2Z" fill="#f6b52b"/><path d="M16 2C9 2 2 16 2 26a14 14 0 0 0 14 14V2Z" fill="#d97a29"/><circle cx="16" cy="26" r="6.5" fill="#fdf8ef"/></svg>
    <div><h1>YOLKO</h1><small>Admin</small></div>
    <button class="ghost out" id="signout" onclick="logout()" style="display:none">Sign out</button>
  </div>

  <div class="card login" id="login-card">
    <h2>Sign in</h2>
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
      <h2>Orders</h2>
      <div id="orders"></div>
      <p class="empty" id="empty" style="display:none">No orders yet. Share getyolko.com to get your first booking!</p>
      <button class="ghost refresh" onclick="loadOrders()">Refresh orders</button>
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
        <div style="grid-column:1/-1"><label>Tray weight</label>
          <select id="tray-weight">
            <option value="1.5">1.5kg (Large)</option>
            <option value="1.75">1.75kg (Extra Large)</option>
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

async function loadOrders() {
  const res = await fetch("/api/orders", { headers: authHeaders() });
  if (!res.ok) return;
  const { orders } = await res.json();

  orders.sort((a, b) => {
    const rank = (o) => o.status === "cancelled" ? 2 : (o.paymentStatus === "paid" ? 0 : 1);
    return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
  });

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

  $("orders").innerHTML = orders.map(o => {
    const prio = o.paymentStatus === "paid" && o.status !== "cancelled";
    return '<div class="order' + (prio ? ' prio' : '') + '">' +
      '<div class="o-top"><span class="o-name">' + escapeHtml(o.name) + '</span><span class="o-price">$' + o.price + '</span></div>' +
      '<div class="o-time">' + fmtTime(o.createdAt) + '</div>' +
      '<div class="o-what">' + describeOrder(o.bundle, o.quantity) + ' <span>· pickup ' + o.pickupDay + (o.pickupDate ? ' ' + o.pickupDate : '') + '</span></div>' +
      '<div class="o-tags">' +
        '<span class="pill ' + o.status + '">' + o.status + '</span>' +
        '<span class="pill day">uses ' + traysFor(o) + (traysFor(o) === 1 ? ' tray' : ' trays') + '</span>' +
        (prio ? '<span class="pill paid">&#9889; paid · priority</span>' : '') +
      '</div>' +
      '<div class="o-actions">' +
        '<a class="callbtn" href="tel:' + o.phone + '">Call ' + fmtPhone(o.phone) + '</a>' +
        actionButtons(o) +
      '</div>' +
    '</div>';
  }).join("");
  $("empty").style.display = orders.length ? "none" : "block";
  renderBuyers(orders);
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
  const dots = pts.map(function(p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#b05f17"/>'; }).join("");
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + area + '" fill="rgba(246,181,43,.22)"/>' +
    (pts.length > 1 ? '<polyline points="' + line + '" fill="none" stroke="#d97a29" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
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
        headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
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
        "X-Yolko-Build": "71",
      },
    });
  },
};
