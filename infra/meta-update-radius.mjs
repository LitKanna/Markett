#!/usr/bin/env node
/**
 * Set all Meta ad sets in the YOLKO ad account to a 45 km pin on Sydney Markets.
 * Usage: META_ACCESS_TOKEN=... node infra/meta-update-radius.mjs
 * Optional: META_RADIUS_KM=45 META_ADSET_ID=... (single ad set)
 */
const TOKEN = process.env.META_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Set META_ACCESS_TOKEN");
  process.exit(1);
}

const API = "https://graph.facebook.com/v21.0";
const ACT_ID = "act_1230148938407162";
const RADIUS_KM = Number(process.env.META_RADIUS_KM || 45);
const HUB = { latitude: -33.8667, longitude: 151.0694 };

async function api(path, body, method = "POST") {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  if (!body) {
    const sep = url.includes("?") ? "&" : "?";
    return fetch(`${url}${sep}access_token=${TOKEN}`).then((r) => r.json());
  }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: TOKEN }),
  });
  return res.json();
}

const targetingPatch = {
  geo_locations: {
    custom_locations: [
      {
        latitude: HUB.latitude,
        longitude: HUB.longitude,
        radius: RADIUS_KM,
        distance_unit: "kilometer",
      },
    ],
  },
};

async function updateOne(id) {
  const before = await api(`/${id}?fields=id,name,status,targeting`, null, "GET");
  if (before.error) {
    console.error("Read failed", id, before.error);
    return;
  }
  console.log("Updating", before.id, before.name, before.status);
  const oldLoc = before.targeting?.geo_locations?.custom_locations?.[0];
  if (oldLoc) console.log("  was:", oldLoc);
  const result = await api(`/${id}`, { targeting: targetingPatch });
  if (result.error) {
    console.error("  error:", result.error);
    return;
  }
  const after = await api(`/${id}?fields=id,name,targeting`, null, "GET");
  console.log("  now:", after.targeting?.geo_locations?.custom_locations?.[0]);
}

async function main() {
  const single = process.env.META_ADSET_ID;
  if (single) {
    await updateOne(single);
    return;
  }
  const list = await api(
    `/${ACT_ID}/adsets?fields=id,name,status,targeting&limit=50&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED","PENDING_REVIEW","PREAPPROVED","WITH_ISSUES"]`,
    null,
    "GET"
  );
  if (list.error) {
    console.error(list.error);
    process.exit(1);
  }
  for (const adset of list.data || []) {
    await updateOne(adset.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
