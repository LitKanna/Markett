const UPSTREAM = "https://litkanna.github.io/Markett";

const DEFAULT_SETTINGS = {
  prices: { tray1: 12, tray2: 23, box: 66 },
  traysAvailable: 24,
  pickup: {
    Friday: { enabled: true, open: "10:00", close: "16:30" },
    Saturday: { enabled: true, open: "06:00", close: "14:00" },
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

async function getSettings(env) {
  const stored = (await env.DATA.get("settings", "json")) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    prices: { ...DEFAULT_SETTINGS.prices, ...(stored.prices || {}) },
    pickup: {
      Friday: cleanPickupDay((stored.pickup || {}).Friday, DEFAULT_SETTINGS.pickup.Friday),
      Saturday: cleanPickupDay((stored.pickup || {}).Saturday, DEFAULT_SETTINGS.pickup.Saturday),
    },
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
      pickup: {
        Friday: cleanPickupDay((body?.pickup || {}).Friday, current.pickup.Friday),
        Saturday: cleanPickupDay((body?.pickup || {}).Saturday, current.pickup.Saturday),
      },
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
    const pickupDay = ["Friday", "Saturday"].includes(body?.pickupDay) ? body.pickupDay : null;
    const quantity = Math.min(20, Math.max(1, Math.floor(Number(body?.quantity)) || 1));

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
      "line_items[0][price_data][product_data][description]": `Pickup ${order.pickupDay} at Paddy's Markets Flemington`,
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
    order.status = status;
    await env.DATA.put(id, JSON.stringify(order));
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>YOLKO Admin</title>
<style>
:root { --cream:#fdf8ef; --ink:#241407; --soft:#6b5949; --line:#ecdfc8; --amber:#d97a29; --amber-d:#b05f17; --yolk:#f6b52b; --green:#3c6e4f; --red:#c0392b; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--cream); color:var(--ink); }
.wrap { max-width:860px; margin:0 auto; padding:24px 16px 60px; }
h1 { font-size:26px; margin:0 0 4px; }
.sub { color:var(--soft); margin:0 0 24px; font-size:14px; }
.card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:18px; box-shadow:0 6px 18px rgba(36,20,7,.06); }
.card h2 { margin:0 0 14px; font-size:18px; }
label { display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--soft); margin-bottom:4px; }
input { width:100%; padding:10px 12px; border:2px solid var(--line); border-radius:10px; font:inherit; font-size:16px; }
input:focus { outline:none; border-color:var(--yolk); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:14px; }
button { padding:11px 20px; border:0; border-radius:999px; font:inherit; font-weight:700; cursor:pointer; background:var(--amber); color:#fff; }
button:hover { background:var(--amber-d); }
button.ghost { background:#f5eadc; color:var(--ink); }
.msg { font-size:13.5px; font-weight:600; margin-left:10px; }
.msg.ok { color:var(--green); } .msg.err { color:var(--red); }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--soft); padding:8px 10px; border-bottom:2px solid var(--line); }
td { padding:10px; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:0; }
.pill { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:800; }
.pill.new { background:#fdeecd; color:var(--amber-d); }
.pill.confirmed { background:#e2ecf9; color:#1d4f91; }
.pill.done { background:#e7f2ea; color:var(--green); }
.pill.cancelled { background:#f7e0dd; color:var(--red); }
.actions button { padding:5px 12px; font-size:12px; margin:2px 2px 0 0; }
.dayrow { display:grid; grid-template-columns:120px 1fr 1fr; gap:12px; align-items:end; margin-bottom:12px; }
.chk { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700; text-transform:none; letter-spacing:0; color:var(--ink); padding-bottom:10px; }
.chk input { width:18px; height:18px; accent-color:var(--amber); }
.stats { display:flex; gap:22px; flex-wrap:wrap; margin-bottom:6px; }
.stats div { font-size:13px; color:var(--soft); }
.stats b { display:block; font-size:22px; color:var(--ink); }
.empty { color:var(--soft); text-align:center; padding:26px 0; }
.topline { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
@media (max-width:640px){ .hide-sm { display:none; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>YOLKO Admin</h1>
  <p class="sub">Orders and shop settings for getyolko.com</p>

  <div class="card" id="login-card">
    <h2>Sign in</h2>
    <div class="grid"><div><label>Admin key</label><input id="key" type="password" placeholder="Paste your admin key"></div></div>
    <button onclick="saveKey()">Sign in</button><span class="msg" id="login-msg"></span>
  </div>

  <div id="panel" style="display:none">
    <div class="card">
      <div class="topline">
        <h2>Orders</h2>
        <button class="ghost" onclick="loadOrders()">Refresh</button>
      </div>
      <div class="stats" id="stats"></div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Order</th><th class="hide-sm">Pickup</th><th>$</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <p class="empty" id="empty" style="display:none">No orders yet. Share getyolko.com to get your first booking!</p>
      </div>
    </div>

    <div class="card">
      <h2>Prices &amp; stock</h2>
      <div class="grid">
        <div><label>1 tray ($)</label><input id="p1" type="number" min="1" step="0.5"></div>
        <div><label>2 trays ($)</label><input id="p2" type="number" min="1" step="0.5"></div>
        <div><label>Full box ($)</label><input id="p3" type="number" min="1" step="0.5"></div>
        <div><label>Trays available</label><input id="stock" type="number" min="0" step="1"></div>
      </div>

      <h2 style="margin-top:8px">Pickup days &amp; hours</h2>
      <div class="dayrow">
        <label class="chk"><input id="fri-on" type="checkbox"> Friday</label>
        <div><label>Opens</label><input id="fri-open" type="time"></div>
        <div><label>Closes</label><input id="fri-close" type="time"></div>
      </div>
      <div class="dayrow">
        <label class="chk"><input id="sat-on" type="checkbox"> Saturday</label>
        <div><label>Opens</label><input id="sat-open" type="time"></div>
        <div><label>Closes</label><input id="sat-close" type="time"></div>
      </div>

      <button onclick="saveSettings()">Save changes</button><span class="msg" id="save-msg"></span>
      <p style="font-size:12.5px;color:var(--soft);margin:12px 0 0">Changes appear on the website within seconds. No code needed. Untick a day to hide it from the site and block new bookings for it.</p>
    </div>

    <button class="ghost" onclick="logout()">Sign out</button>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let KEY = localStorage.getItem("yolko_admin_key") || "";

function describeOrder(bundle, qty) {
  qty = qty || 1;
  if (bundle === "box") {
    return qty === 1 ? "1 box (180 eggs)" : qty + " boxes (" + (180 * qty).toLocaleString() + " eggs)";
  }
  const trays = (bundle === "tray2" ? 2 : 1) * qty;
  return trays === 1 ? "1 tray (30 eggs)" : trays + " trays (" + (30 * trays).toLocaleString() + " eggs)";
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
    $("login-msg").textContent = "Wrong key";
    $("login-msg").className = "msg err";
  }
}

function logout() {
  localStorage.removeItem("yolko_admin_key");
  location.reload();
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

async function loadOrders() {
  const res = await fetch("/api/orders", { headers: authHeaders() });
  if (!res.ok) return;
  const { orders } = await res.json();

  const active = orders.filter(o => o.status !== "cancelled");
  const revenue = active.filter(o => o.status !== "new").reduce((s, o) => s + (o.price || 0), 0);
  const paidOnline = active.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + (o.price || 0), 0);
  const pending = orders.filter(o => o.status === "new").length;
  $("stats").innerHTML =
    "<div><b>" + orders.length + "</b>total orders</div>" +
    "<div><b>" + pending + "</b>waiting</div>" +
    "<div><b>$" + revenue + "</b>confirmed value</div>" +
    "<div><b>$" + paidOnline + "</b>paid online</div>";

  $("rows").innerHTML = orders.map(o => (
    "<tr>" +
    "<td>" + fmtTime(o.createdAt) + "</td>" +
    "<td>" + escapeHtml(o.name) + "</td>" +
    "<td><a href='tel:" + o.phone + "'>" + o.phone.replace(/(\\d{4})(\\d{3})(\\d{3})/, "$1 $2 $3") + "</a></td>" +
    "<td>" + describeOrder(o.bundle, o.quantity) + "</td>" +
    "<td class='hide-sm'>" + o.pickupDay + "</td>" +
    "<td><b>$" + o.price + "</b></td>" +
    "<td><span class='pill " + o.status + "'>" + o.status + "</span>" + (o.paymentStatus === "paid" ? " <span class='pill done'>💳 paid</span>" : "") + "</td>" +
    "<td class='actions'>" + actionButtons(o) + "</td>" +
    "</tr>"
  )).join("");
  $("empty").style.display = orders.length ? "none" : "block";
}

function actionButtons(o) {
  const btn = (status, label) => "<button class='ghost' onclick=\\"setStatus('" + o.id + "','" + status + "')\\">" + label + "</button>";
  if (o.status === "new") return btn("confirmed", "Confirm") + btn("cancelled", "Cancel");
  if (o.status === "confirmed") return btn("done", "Picked up") + btn("cancelled", "Cancel");
  return btn("new", "Reopen");
}

async function setStatus(id, status) {
  await fetch("/api/order-status", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id, status }) });
  loadOrders();
}

async function loadSettings() {
  const res = await fetch("/api/settings");
  const s = await res.json();
  $("p1").value = s.prices.tray1;
  $("p2").value = s.prices.tray2;
  $("p3").value = s.prices.box;
  $("stock").value = s.traysAvailable;
  $("fri-on").checked = s.pickup.Friday.enabled;
  $("fri-open").value = s.pickup.Friday.open;
  $("fri-close").value = s.pickup.Friday.close;
  $("sat-on").checked = s.pickup.Saturday.enabled;
  $("sat-open").value = s.pickup.Saturday.open;
  $("sat-close").value = s.pickup.Saturday.close;
}

async function saveSettings() {
  const body = {
    prices: { tray1: +$("p1").value, tray2: +$("p2").value, box: +$("p3").value },
    traysAvailable: +$("stock").value,
    pickup: {
      Friday: { enabled: $("fri-on").checked, open: $("fri-open").value, close: $("fri-close").value },
      Saturday: { enabled: $("sat-on").checked, open: $("sat-open").value, close: $("sat-close").value },
    },
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

    // Canonical: force https and apex host
    if (url.protocol === "http:" || url.hostname.startsWith("www.")) {
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

    const upstreamUrl = UPSTREAM + url.pathname + url.search;
    const upstreamResp = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "yolko-edge",
        "Accept": request.headers.get("Accept") || "*/*",
        "Accept-Encoding": request.headers.get("Accept-Encoding") || "",
      },
      redirect: "manual",
    });

    if (upstreamResp.status >= 301 && upstreamResp.status <= 308) {
      const location = upstreamResp.headers.get("Location") || "";
      const rewritten = location
        .replace("https://litkanna.github.io/Markett", "https://getyolko.com")
        .replace("https://litkanna.github.io", "https://getyolko.com");
      const headers = new Headers(upstreamResp.headers);
      headers.set("Location", rewritten);
      return new Response(null, { status: upstreamResp.status, headers });
    }

    const headers = new Headers(upstreamResp.headers);
    headers.delete("X-GitHub-Request-Id");
    headers.delete("X-Served-By");
    headers.delete("X-Fastly-Request-ID");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers,
    });
  },
};
