#!/usr/bin/env node
/**
 * Rebuild YOLKO Meta Sales structure end-to-end (Purchase optimisation).
 *
 * Usage:
 *   META_ACCESS_TOKEN=... node infra/meta-sales-rebuild.mjs
 *   META_ACCESS_TOKEN=... META_ACTIVATE=1 node infra/meta-sales-rebuild.mjs
 *
 * Structure:
 *   Campaign: YOLKO — Sales (Purchase)   [$14/day CBO]
 *     Ad set: Cold — Markets 50km · Purchase
 *       Ads: Price $13 · Sat delivery · 2 trays $25
 *     Ad set: Retarget — Site visitors 14d
 *       Ad: Retarget · Price $13
 */
const TOKEN = String(process.env.META_ACCESS_TOKEN || "").trim();
if (!TOKEN) {
  console.error("Set META_ACCESS_TOKEN");
  process.exit(1);
}

const API = "https://graph.facebook.com/v21.0";
const ACT = "act_1940573363326611";
const PIXEL = "2008953469766472";
const PAGE = "1208970268967183";
const SITE = "https://getyolko.com/";
const CAMPAIGN_ID = "120251266112440131";
const COLD_ADSET_ID = "120251266112450131";
const OLD_AD_ID = "120251266112460131";
const ACTIVATE = process.env.META_ACTIVATE === "1";

const HUB = { latitude: -33.8667, longitude: 151.0694 };
const IMAGE_CHALK = "c536706e7d6ea7b3cb8913c7f9c0283a";
// Do NOT reuse the deleted market-shelf pace-tray-175kg image (hash c3dae4b9…).
const IMAGE_TRAY = IMAGE_CHALK;
const IMAGE_EXISTING = "49a60c0db3f763fde3c25f30264e7fee";

async function api(path, body = null, method = "GET") {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  if (method === "GET" || body == null) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(TOKEN)}`);
    return res.json();
  }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: TOKEN }),
  });
  return res.json();
}

function assertOk(label, json) {
  if (json?.error) {
    console.error(`❌ ${label}:`, JSON.stringify(json.error, null, 2));
    throw new Error(`${label}: ${json.error.message}`);
  }
  console.log(`✅ ${label}`);
  return json;
}

const COLD_TARGETING = {
  geo_locations: {
    custom_locations: [
      {
        latitude: HUB.latitude,
        longitude: HUB.longitude,
        radius: 50,
        distance_unit: "kilometer",
      },
    ],
    location_types: ["home", "recent"],
  },
  age_min: 18,
  age_max: 65, // Meta max = 65+ (covers 75+)
  targeting_automation: { advantage_audience: 0 },
};

const ADS = [
  {
    name: "Ad · Price $13",
    image: IMAGE_CHALK,
    message:
      "30 XL fresh eggs for $13 — that's about 43¢ an egg.\n\n" +
      "Book online — Saturday delivery +$5 within 45 km of Sydney Markets.\n" +
      "Pay online to lock them in.",
    headline: "30 Eggs $13 · Sat delivery",
    description: "Within 45 km of Sydney Markets",
  },
  {
    name: "Ad · Sat delivery +$5",
    // Clean tray product shot (delivery ad — not market chalk)
    image: IMAGE_TRAY,
    message:
      "We deliver Saturday for +$5 within 45 km of Sydney Markets.\n\n" +
      "30 eggs $13 · 2 trays $25 · full box $72.\n" +
      "Book on getyolko.com — packed fresh for your suburb.",
    headline: "Sat delivery +$5 · Book online",
    description: "Within 45 km of Sydney Markets",
  },
  {
    name: "Ad · 2 trays $25",
    image: IMAGE_EXISTING,
    message:
      "Feeding the family? Grab 2 trays — 60 fresh Pace Farm eggs for $25.\n\n" +
      "Saturday delivery +$5 within 45 km of Sydney Markets.",
    headline: "60 eggs $25 · 2 trays",
    description: "Saturday delivery Sydney",
  },
];

async function ensureCreative(spec) {
  const attempts = [
    {
      name: `${spec.name} creative`,
      object_story_spec: {
        page_id: PAGE,
        link_data: {
          link: SITE,
          message: spec.message,
          name: spec.headline,
          description: spec.description,
          image_hash: spec.image,
          call_to_action: { type: "SHOP_NOW" },
        },
      },
    },
    {
      name: `${spec.name} creative`,
      object_story_spec: {
        page_id: PAGE,
        instagram_user_id: "17841447906384112",
        link_data: {
          link: SITE,
          message: spec.message,
          name: spec.headline,
          description: spec.description,
          image_hash: spec.image,
          call_to_action: { type: "SHOP_NOW" },
        },
      },
    },
  ];

  let lastErr = null;
  for (const body of attempts) {
    const json = await api(`/${ACT}/adcreatives`, body, "POST");
    if (!json.error) return json.id;
    lastErr = json.error;
    console.warn(`   creative attempt failed: ${json.error.error_user_title || json.error.message}`);
  }
  throw new Error(lastErr?.message || "creative failed");
}

async function ensureAd(adsetId, spec) {
  const list = await api(`/${adsetId}/ads?fields=id,name,status&limit=50`);
  const existing = (list.data || []).find((a) => a.name === spec.name);
  if (existing) {
    console.log(`   reuse ad ${existing.id} ${spec.name}`);
    if (ACTIVATE && existing.status !== "ACTIVE") {
      assertOk(`activate ${spec.name}`, await api(`/${existing.id}`, { status: "ACTIVE" }, "POST"));
    }
    return existing.id;
  }
  const creativeId = await ensureCreative(spec);
  console.log(`   creative ${creativeId}`);
  const ad = assertOk(
    `create ${spec.name}`,
    await api(
      `/${ACT}/ads`,
      {
        name: spec.name,
        adset_id: adsetId,
        creative: { creative_id: creativeId },
        status: ACTIVATE ? "ACTIVE" : "PAUSED",
      },
      "POST"
    )
  );
  return ad.id;
}

async function ensureVisitorAudience() {
  const list = await api(`/${ACT}/customaudiences?fields=id,name&limit=100`);
  const name = "YOLKO site visitors 14d";
  const existing = (list.data || []).find((a) => a.name === name);
  if (existing) {
    console.log(`   reuse audience ${existing.id}`);
    return existing.id;
  }
  // Requires Custom Audience TOS accepted for the ad account once.
  const rule = JSON.stringify({
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: PIXEL, type: "pixel" }],
          retention_seconds: 14 * 24 * 3600,
          filter: {
            operator: "and",
            filters: [{ field: "event", operator: "eq", value: "PageView" }],
          },
        },
      ],
    },
  });
  const created = assertOk(
    "create visitor audience",
    await api(
      `/${ACT}/customaudiences`,
      {
        name,
        rule,
        prefill: true,
      },
      "POST"
    )
  );
  return created.id;
}

async function ensureRetargetAdSet(campaignId, audienceId) {
  const name = "Retarget — Site visitors 14d";
  const list = await api(`/${ACT}/adsets?fields=id,name,campaign_id,status&limit=50`);
  const existing = (list.data || []).find((a) => a.name === name && a.campaign_id === campaignId);
  const targeting = {
    geo_locations: {
      custom_locations: [
        {
          latitude: HUB.latitude,
          longitude: HUB.longitude,
          radius: 50,
          distance_unit: "kilometer",
        },
      ],
      location_types: ["home", "recent"],
    },
    age_min: 18,
    age_max: 65,
    custom_audiences: [{ id: audienceId }],
    targeting_automation: { advantage_audience: 0 },
  };

  if (existing) {
    assertOk(
      "update retarget ad set",
      await api(
        `/${existing.id}`,
        {
          name,
          targeting,
          promoted_object: { pixel_id: PIXEL, custom_event_type: "PURCHASE" },
        },
        "POST"
      )
    );
    return existing.id;
  }

  const created = assertOk(
    "create retarget ad set",
    await api(
      `/${ACT}/adsets`,
      {
        name,
        campaign_id: campaignId,
        billing_event: "IMPRESSIONS",
        optimization_goal: "OFFSITE_CONVERSIONS",
        // Campaign bid_strategy is COST_CAP — ad sets need bid_amount (cents).
        bid_amount: 100,
        promoted_object: { pixel_id: PIXEL, custom_event_type: "PURCHASE" },
        targeting,
        status: ACTIVATE ? "ACTIVE" : "PAUSED",
        // Campaign uses shared daily budget — no ad set daily_budget
      },
      "POST"
    )
  );
  return created.id;
}

async function main() {
  console.log("Rebuilding YOLKO Sales campaign… activate=", ACTIVATE);

  assertOk(
    "rename campaign",
    await api(`/${CAMPAIGN_ID}`, { name: "YOLKO — Sales (Purchase)", daily_budget: "1400" }, "POST")
  );

  assertOk(
    "update cold ad set",
    await api(
      `/${COLD_ADSET_ID}`,
      {
        name: "Cold — Markets 50km · Purchase",
        targeting: COLD_TARGETING,
        optimization_goal: "OFFSITE_CONVERSIONS",
        promoted_object: { pixel_id: PIXEL, custom_event_type: "PURCHASE" },
        status: ACTIVATE ? "ACTIVE" : undefined,
      },
      "POST"
    )
  );

  // Pause legacy unnamed ad so the 3 new creatives compete cleanly
  assertOk("pause legacy New Sales Ad", await api(`/${OLD_AD_ID}`, { status: "PAUSED" }, "POST"));

  const coldAdIds = [];
  for (const spec of ADS) {
    coldAdIds.push(await ensureAd(COLD_ADSET_ID, spec));
  }

  const audienceId = await ensureVisitorAudience();
  const retargetAdSetId = await ensureRetargetAdSet(CAMPAIGN_ID, audienceId);
  const retargetAdId = await ensureAd(retargetAdSetId, {
    ...ADS[0],
    name: "Ad · Retarget Price $13",
  });

  if (ACTIVATE) {
    assertOk("activate campaign", await api(`/${CAMPAIGN_ID}`, { status: "ACTIVE" }, "POST"));
    assertOk("activate cold ad set", await api(`/${COLD_ADSET_ID}`, { status: "ACTIVE" }, "POST"));
    assertOk("activate retarget ad set", await api(`/${retargetAdSetId}`, { status: "ACTIVE" }, "POST"));
  }

  const summary = {
    campaignId: CAMPAIGN_ID,
    campaignName: "YOLKO — Sales (Purchase)",
    dailyBudgetAud: 14,
    coldAdSetId: COLD_ADSET_ID,
    coldAdIds,
    audienceId,
    retargetAdSetId,
    retargetAdId,
    pixelId: PIXEL,
    pageId: PAGE,
    geo: "Sydney Markets hub 50 km",
    status: ACTIVATE ? "ACTIVE" : "PAUSED",
    adsManager: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1940573363326611&selected_campaign_ids=${CAMPAIGN_ID}`,
  };
  console.log(JSON.stringify(summary, null, 2));
  await import("fs").then((fs) =>
    fs.writeFileSync("/tmp/meta_rebuild_result.json", JSON.stringify(summary, null, 2))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
