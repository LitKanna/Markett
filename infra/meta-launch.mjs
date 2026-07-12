#!/usr/bin/env node
/**
 * Launch YOLKO Meta (Facebook + Instagram) traffic campaign.
 * Usage: META_ACCESS_TOKEN=... node infra/meta-launch.mjs
 *
 * If creative creation fails (app in Development mode), switch the Yolko app
 * to Live at https://developers.facebook.com/apps/2531670010617110/settings/basic/
 * then re-run this script — it reuses the existing campaign and ad set.
 */

const TOKEN = process.env.META_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Set META_ACCESS_TOKEN");
  process.exit(1);
}

const API = "https://graph.facebook.com/v21.0";
const ACT_ID = "act_1230148938407162";
const PAGE_ID = "1208071762387787";
const IMAGE_HASH = "b2bcac98c3e840b89706c8cc5c3e3b02";
const SITE = "https://getyolko.com/";
const CAMPAIGN_NAME = "YOLKO — Flemington pickup";
const ADSET_NAME = "Flemington 8km — Fri/Sat pickup";

async function api(path, body, method = "POST") {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const opts = { method };
  if (body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify({ ...body, access_token: TOKEN });
  } else {
    const sep = url.includes("?") ? "&" : "?";
    return fetch(`${url}${sep}access_token=${TOKEN}`).then((r) => r.json());
  }
  const res = await fetch(url, opts);
  const json = await res.json();
  if (json.error) {
    console.error("API error:", JSON.stringify(json.error, null, 2));
    throw new Error(json.error.message);
  }
  return json;
}

async function findByName(collection, name) {
  const list = await api(`/${ACT_ID}/${collection}?fields=id,name,status&limit=50`, null, "GET");
  return (list.data || []).find((x) => x.name === name);
}

async function ensureCampaign() {
  const existing = await findByName("campaigns", CAMPAIGN_NAME);
  if (existing) {
    console.log("Reusing campaign:", existing.id);
    return existing.id;
  }
  console.log("Creating campaign…");
  const campaign = await api(`/${ACT_ID}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  console.log("Campaign:", campaign.id);
  return campaign.id;
}

async function ensureAdSet(campaignId) {
  const list = await api(
    `/${ACT_ID}/adsets?fields=id,name,status,campaign_id&limit=50`,
    null,
    "GET"
  );
  const existing = (list.data || []).find(
    (x) => x.name === ADSET_NAME && x.campaign_id === campaignId
  );
  if (existing) {
    console.log("Reusing ad set:", existing.id);
    return existing.id;
  }
  console.log("Creating ad set…");
  const adset = await api(`/${ACT_ID}/adsets`, {
    name: ADSET_NAME,
    campaign_id: campaignId,
    daily_budget: "1000",
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    start_time: new Date().toISOString(),
    targeting: {
      geo_locations: {
        custom_locations: [
          {
            latitude: -33.8688,
            longitude: 151.069,
            radius: 8,
            distance_unit: "kilometer",
          },
        ],
      },
      age_min: 18,
      age_max: 65,
      flexible_spec: [
        {
          interests: [
            { id: "6003659420716", name: "Cooking (food and drink)" },
            { id: "6003134986700", name: "Baking (cooking)" },
            { id: "6003380299181", name: "Farmers' market (food retailer)" },
            { id: "6003174128015", name: "Supermarket (food retailer)" },
            { id: "6003476182657", name: "Family (social concept)" },
          ],
        },
      ],
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "story", "facebook_reels"],
      instagram_positions: ["stream", "story", "reels"],
    },
  });
  console.log("Ad set:", adset.id);
  return adset.id;
}

const ADS = [
  {
    name: "Ad 1 — Price lead",
    message:
      "30 XL fresh eggs for $12. That's 40 cents an egg.\n" +
      "Book your Pace Farm tray online now and pick it up at Paddy's Markets " +
      "Flemington this coming Friday or Saturday. The website shows your exact " +
      "pickup date when you book. Pay online for priority, or pay at pickup.",
    headline: "30 Eggs $12 — Book Now, Pickup Fri/Sat",
    description: "Paddy's Markets Flemington",
  },
  {
    name: "Ad 2 — Family angle",
    message:
      "Feeding a family? Grab 2 trays — 60 fresh eggs for $23.\n" +
      "Skip the supermarket queue. Book online, pick up at Flemington Markets " +
      "Friday or Saturday. Pay online for priority, or pay at pickup.",
    headline: "60 Eggs for $23 — Book Ahead",
    description: "Pickup at Paddy's Markets Flemington",
  },
  {
    name: "Ad 3 — Café / small business",
    message:
      "Cafés, stalls, bakers: a full box of 180 fresh Pace Farm eggs for $66, " +
      "ready every Friday and Saturday at Flemington Markets.\n" +
      "Book a weekly box and your stock is put aside first.",
    headline: "180 Eggs — $66 — Weekly Supply",
    description: "For cafés and food businesses",
  },
];

async function existingAds(adsetId) {
  const list = await api(
    `/${adsetId}/ads?fields=id,name,status&limit=50`,
    null,
    "GET"
  );
  return list.data || [];
}

async function createAd(adsetId, spec) {
  const have = await existingAds(adsetId);
  const dup = have.find((a) => a.name === spec.name);
  if (dup) {
    console.log("Reusing ad:", dup.id, spec.name);
    return dup.id;
  }

  console.log("Creating creative for", spec.name, "…");
  const creative = await api(`/${ACT_ID}/adcreatives`, {
    name: spec.name,
    object_story_spec: {
      page_id: PAGE_ID,
      link_data: {
        link: SITE,
        message: spec.message,
        name: spec.headline,
        description: spec.description,
        call_to_action: { type: "SHOP_NOW" },
        image_hash: IMAGE_HASH,
      },
    },
  });

  const ad = await api(`/${ACT_ID}/ads`, {
    name: spec.name,
    adset_id: adsetId,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });
  console.log("Ad:", ad.id, spec.name);
  return ad.id;
}

async function activate(ids) {
  console.log("\nActivating campaign, ad set, and ads…");
  for (const adId of ids.adIds) {
    await api(`/${adId}`, { status: "ACTIVE" });
  }
  await api(`/${ids.adsetId}`, { status: "ACTIVE" });
  await api(`/${ids.campaignId}`, { status: "ACTIVE" });
  console.log("All set to ACTIVE.");
}

async function main() {
  const campaignId = await ensureCampaign();
  const adsetId = await ensureAdSet(campaignId);

  const adIds = [];
  for (const spec of ADS) {
    adIds.push(await createAd(adsetId, spec));
  }

  const actNum = ACT_ID.replace("act_", "");
  console.log("\nReview in Ads Manager:");
  console.log(
    `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actNum}&selected_campaign_ids=${campaignId}`
  );

  if (process.env.META_ACTIVATE === "1") {
    await activate({ campaignId, adsetId, adIds });
  } else {
    console.log("\nAds created PAUSED. Set META_ACTIVATE=1 and re-run to go live.");
  }

  console.log(
    JSON.stringify({ campaignId, adsetId, adIds, dailyBudgetAud: 10 }, null, 2)
  );
}

main().catch((e) => {
  if (String(e.message).includes("development mode")) {
    console.error(
      "\nYour Meta app is in Development mode. Switch it to Live:\n" +
        "  https://developers.facebook.com/apps/2531670010617110/settings/basic/\n" +
        "Toggle “App Mode” to Live, then re-run this script.\n" +
        "Campaign and ad set are already saved — only creatives need to finish."
    );
  }
  process.exit(1);
});
