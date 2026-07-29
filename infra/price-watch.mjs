/**
 * Reactive competitor egg-price watch.
 *
 * Retailers do NOT push webhooks when prices change. Closest real-time loop:
 *   1) Worker cron polls open sources every few minutes
 *   2) Diff vs last snapshot in KV
 *   3) Store change events + optional outbound webhook (PRICE_WATCH_WEBHOOK)
 *   4) Scout / CI can also POST full snapshots to /api/price-watch/ingest
 */

const PRICE_LATEST_KEY = "pricewatch:latest";
const PRICE_EVENTS_KEY = "pricewatch:events";
const PRICE_EVENTS_MAX = 200;

const CAGED_RE = /\b(caged?|cage[\s-]?raised|natural\s+cage)\b/i;
const NOT_CAGED_RE = /\b(cage[\s-]?free|free[\s-]?range|barn|organic|pasture)\b/i;
const W700_RE = /\b700\s*g\b|\b700g\b/i;
const PACK30_RE = /\b30[\s-]*(pack|pk|piece|eggs?)\b|\b30pk\b/i;

function offerKey(o) {
  // Prefer stable URL+category so minor title differences don't create false churn.
  let url = String(o.url || "").split("?")[0].toLowerCase().replace(/\/$/, "");
  const cat = String(o.category || "");
  if (url) return `${url}|${cat}`;
  const title = String(o.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${String(o.retailer || "").toLowerCase()}|${title}|${cat}`;
}

function money(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function classifyOffer(raw) {
  const title = String(raw.title || "");
  const looksCaged = CAGED_RE.test(title);
  const looksNot = NOT_CAGED_RE.test(title);
  if (looksNot && /cage[\s-]?free|free[\s-]?range/i.test(title)) {
    return null;
  }
  if (!looksCaged) return null;

  let weight = raw.pack_weight_g != null ? Number(raw.pack_weight_g) : null;
  if (!Number.isFinite(weight)) {
    const m = title.match(/\b(700|1500|1750|1\.5|1\.75)\s*k?g\b/i);
    if (m) {
      const r = m[1].toLowerCase();
      weight = r === "1.5" ? 1500 : r === "1.75" ? 1750 : Number(r);
    }
  }
  let eggs = raw.pack_eggs != null ? Number(raw.pack_eggs) : null;
  if (!Number.isFinite(eggs)) {
    if (PACK30_RE.test(title)) eggs = 30;
    else if (/\b(12[\s-]*(pack|pk|piece|eggs?)|dozen)\b/i.test(title)) eggs = 12;
    else if (/\b10[\s-]*(pack|pk|piece|eggs?)\b/i.test(title)) eggs = 10;
  }

  let category = null;
  if (eggs === 30 || PACK30_RE.test(title) || weight === 1500 || weight === 1750) {
    category = "caged_30pack";
  } else if (weight === 700 || W700_RE.test(title)) {
    category = "caged_700g";
  } else {
    return null;
  }

  const price = money(raw.price_aud ?? raw.price);
  const per =
    price != null && eggs ? Math.round((price / eggs) * 10000) / 10000 : money(raw.per_egg_aud);

  return {
    retailer: String(raw.retailer || "unknown").slice(0, 80),
    title: title.replace(/\s+/g, " ").trim().slice(0, 200),
    brand: String(raw.brand || "").slice(0, 80),
    category,
    housing: "caged",
    pack_eggs: eggs,
    pack_weight_g: weight,
    price_aud: price,
    per_egg_aud: per,
    stock: String(raw.stock || "unknown").slice(0, 40),
    url: String(raw.url || "").slice(0, 400),
    source: String(raw.source || "unknown").slice(0, 40),
    notes: String(raw.notes || "").slice(0, 300),
    fetched_at: String(raw.fetched_at || new Date().toISOString()),
  };
}

function normalizeOffers(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const o = classifyOffer(raw) || (raw?.category && String(raw.category).startsWith("caged_")
      ? {
          retailer: String(raw.retailer || "unknown").slice(0, 80),
          title: String(raw.title || "").slice(0, 200),
          brand: String(raw.brand || "").slice(0, 80),
          category: String(raw.category),
          housing: "caged",
          pack_eggs: Number(raw.pack_eggs) || null,
          pack_weight_g: Number(raw.pack_weight_g) || null,
          price_aud: money(raw.price_aud),
          per_egg_aud: money(raw.per_egg_aud),
          stock: String(raw.stock || "unknown").slice(0, 40),
          url: String(raw.url || "").slice(0, 400),
          source: String(raw.source || "unknown").slice(0, 40),
          notes: String(raw.notes || "").slice(0, 300),
          fetched_at: String(raw.fetched_at || new Date().toISOString()),
        }
      : null);
    if (!o || (o.category !== "caged_700g" && o.category !== "caged_30pack")) continue;
    // Skip competitor rows without a price unless stock flipped meaningfully later
    const key = offerKey(o);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

function diffOffers(prevList, nextList) {
  const prev = new Map((prevList || []).map((o) => [offerKey(o), o]));
  const next = new Map((nextList || []).map((o) => [offerKey(o), o]));
  const changes = [];
  const now = new Date().toISOString();

  for (const [key, n] of next) {
    const p = prev.get(key);
    if (!p) {
      if (n.price_aud != null) {
        changes.push({
          type: "added",
          at: now,
          key,
          retailer: n.retailer,
          title: n.title,
          category: n.category,
          url: n.url,
          from: null,
          to: { price_aud: n.price_aud, per_egg_aud: n.per_egg_aud, stock: n.stock },
        });
      }
      continue;
    }
    const priceChanged =
      money(p.price_aud) !== money(n.price_aud) &&
      (money(p.price_aud) != null || money(n.price_aud) != null);
    const stockChanged = String(p.stock || "") !== String(n.stock || "");
    if (priceChanged || stockChanged) {
      changes.push({
        type: priceChanged && stockChanged ? "price_and_stock" : priceChanged ? "price" : "stock",
        at: now,
        key,
        retailer: n.retailer,
        title: n.title,
        category: n.category,
        url: n.url,
        from: { price_aud: p.price_aud, per_egg_aud: p.per_egg_aud, stock: p.stock },
        to: { price_aud: n.price_aud, per_egg_aud: n.per_egg_aud, stock: n.stock },
        delta_aud:
          money(n.price_aud) != null && money(p.price_aud) != null
            ? Math.round((n.price_aud - p.price_aud) * 100) / 100
            : null,
      });
    }
  }

  for (const [key, p] of prev) {
    if (!next.has(key) && p.price_aud != null) {
      changes.push({
        type: "removed",
        at: now,
        key,
        retailer: p.retailer,
        title: p.title,
        category: p.category,
        url: p.url,
        from: { price_aud: p.price_aud, per_egg_aud: p.per_egg_aud, stock: p.stock },
        to: null,
      });
    }
  }
  return changes;
}

async function getLatest(env) {
  return (await env.DATA.get(PRICE_LATEST_KEY, "json")) || null;
}

async function getEvents(env) {
  const raw = await env.DATA.get(PRICE_EVENTS_KEY, "json");
  return Array.isArray(raw) ? raw : [];
}

async function pushEvents(env, changes) {
  if (!changes.length) return [];
  const prev = await getEvents(env);
  const next = [...changes, ...prev].slice(0, PRICE_EVENTS_MAX);
  await env.DATA.put(PRICE_EVENTS_KEY, JSON.stringify(next));
  return changes;
}

async function notifyWebhook(env, payload) {
  const hook = String(env.PRICE_WATCH_WEBHOOK || "").trim();
  if (!hook || !payload?.changes?.length) return { sent: false, reason: "no_webhook_or_no_changes" };
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "yolko-price-watch",
      },
      body: JSON.stringify(payload),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: String(e?.message || e) };
  }
}

function cheapest(offers, category) {
  const rows = (offers || []).filter(
    (o) =>
      o.category === category &&
      o.price_aud != null &&
      o.per_egg_aud != null &&
      o.retailer !== "YOLKO (own)" &&
      o.stock === "in_stock"
  );
  if (!rows.length) return null;
  return rows.reduce((a, b) => (a.per_egg_aud <= b.per_egg_aud ? a : b));
}

async function ingestSnapshot(env, body, meta = {}) {
  const incoming = normalizeOffers(body?.offers || body?.offers_caged_700g || []);
  // Also accept split arrays from scout report
  if (Array.isArray(body?.offers_caged_700g)) {
    for (const o of normalizeOffers(body.offers_caged_700g)) incoming.push(o);
  }
  if (Array.isArray(body?.offers_caged_30pack)) {
    for (const o of normalizeOffers(body.offers_caged_30pack)) incoming.push(o);
  }
  // Dedupe again after merges
  const byKey = new Map();
  for (const o of incoming) byKey.set(offerKey(o), o);
  const offers = [...byKey.values()];

  const prevDoc = await getLatest(env);
  const prevOffers = prevDoc?.offers || [];
  const changes = diffOffers(prevOffers, offers);

  const doc = {
    updatedAt: new Date().toISOString(),
    source: meta.source || body?.source || "ingest",
    as_of_local_date: body?.as_of_local_date || null,
    offers,
    summary: {
      cheapest_700g_in_stock: cheapest(offers, "caged_700g"),
      cheapest_30pack_in_stock: cheapest(offers, "caged_30pack"),
      count_700g: offers.filter((o) => o.category === "caged_700g").length,
      count_30pack: offers.filter((o) => o.category === "caged_30pack").length,
    },
    last_changes: changes,
  };

  await env.DATA.put(PRICE_LATEST_KEY, JSON.stringify(doc));
  await pushEvents(env, changes);

  const webhook = await notifyWebhook(env, {
    type: "yolko.price_watch.changed",
    updatedAt: doc.updatedAt,
    changeCount: changes.length,
    changes,
    summary: doc.summary,
  });

  return { ok: true, changeCount: changes.length, changes, summary: doc.summary, webhook };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "yolko-price-watch/1.0 (+https://getyolko.com)",
      Accept: "application/json,text/html,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return { kind: "json", data: await res.json(), status: res.status };
  return { kind: "text", data: await res.text(), status: res.status };
}

async function pollOpenSources() {
  const offers = [];
  const now = new Date().toISOString();

  // Umall Shopify JSON (open)
  const umallHandles = [
    ["pace-farm-cage-eggs-xl-12-pieces-700g", 12, 700],
    ["pace-farm-caged-eggs-large-30-pack-1-5kg", 30, 1500],
  ];
  for (const [handle, eggs, weight] of umallHandles) {
    try {
      const { data } = await fetchJson(`https://www.umall.com.au/products/${handle}.json`);
      const prod = data.product || {};
      const v = (prod.variants || [])[0] || {};
      offers.push({
        retailer: "Umall",
        title: prod.title || handle,
        brand: prod.vendor || "Pace Farm",
        category: eggs === 30 ? "caged_30pack" : "caged_700g",
        pack_eggs: eggs,
        pack_weight_g: Number(v.grams) || weight,
        price_aud: money(v.price),
        stock: v.available === true ? "in_stock" : v.available === false ? "out_of_stock" : "unknown",
        url: `https://www.umall.com.au/products/${handle}`,
        source: "worker_poll",
        fetched_at: now,
        notes: `compare_at=${v.compare_at_price || ""}`,
      });
    } catch (e) {
      offers.push({
        retailer: "Umall",
        title: handle,
        brand: "Pace Farm",
        category: eggs === 30 ? "caged_30pack" : "caged_700g",
        pack_eggs: eggs,
        pack_weight_g: weight,
        price_aud: null,
        stock: "error",
        url: `https://www.umall.com.au/products/${handle}`,
        source: "worker_poll",
        fetched_at: now,
        notes: String(e.message || e),
      });
    }
  }

  // Gourmet Grocer WooCommerce HTML
  const gg = [
    [
      "https://gourmetgroceronline.com.au/product/pace-farm-cage-eggs-xl-12-pieces-700g/",
      "Pace Farm Cage Eggs XL 12 Pieces 700g",
      12,
      700,
      "caged_700g",
    ],
    [
      "https://gourmetgroceronline.com.au/product/pace-farm-caged-eggs-large-30-pack-1-5kg/",
      "Pace Farm Caged Eggs Large 30 Pack 1.5kg",
      30,
      1500,
      "caged_30pack",
    ],
  ];
  for (const [url, title, eggs, weight, category] of gg) {
    try {
      const { data: html } = await fetchJson(url);
      const m = String(html).match(/"price"\s*:\s*"([0-9]+(?:\.[0-9]+)?)"/);
      const price = m ? money(m[1]) : null;
      let stock = "unknown";
      if (/out[\s-]of[\s-]stock/i.test(html)) stock = "out_of_stock";
      else if (/add to cart|add-to-cart|in[\s-]stock/i.test(html)) stock = "in_stock";
      offers.push({
        retailer: "Gourmet Grocer",
        title,
        brand: "Pace Farm",
        category,
        pack_eggs: eggs,
        pack_weight_g: weight,
        price_aud: price,
        stock,
        url,
        source: "worker_poll",
        fetched_at: now,
      });
    } catch (e) {
      offers.push({
        retailer: "Gourmet Grocer",
        title,
        brand: "Pace Farm",
        category,
        pack_eggs: eggs,
        pack_weight_g: weight,
        price_aud: null,
        stock: "error",
        url,
        source: "worker_poll",
        fetched_at: now,
        notes: String(e.message || e),
      });
    }
  }

  return offers;
}

/** Merge polled offers into latest snapshot (keeps non-overlapping previous rows). */
async function runScheduledPoll(env) {
  const polled = await pollOpenSources();
  const prev = await getLatest(env);
  const prevOffers = prev?.offers || [];

  // Replace same retailer+url from poll; keep other sources (manual/scout)
  const map = new Map();
  for (const o of prevOffers) map.set(offerKey(o), o);
  for (const o of normalizeOffers(polled)) map.set(offerKey(o), o);

  return ingestSnapshot(
    env,
    { offers: [...map.values()], source: "worker_cron" },
    { source: "worker_cron" }
  );
}

export {
  ingestSnapshot,
  getLatest,
  getEvents,
  runScheduledPoll,
  pollOpenSources,
  diffOffers,
  normalizeOffers,
};
