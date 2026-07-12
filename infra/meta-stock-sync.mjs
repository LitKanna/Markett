#!/usr/bin/env node
/**
 * Pause Meta ad sets when YOLKO tray stock is sold out; resume when restocked
 * (only if this script / worker previously paused them).
 *
 * Stock source: https://getyolko.com/api/settings → traysAvailable
 * (box orders already count as 6 trays in the Worker).
 *
 * Usage:
 *   META_ACCESS_TOKEN=... node infra/meta-stock-sync.mjs
 *   META_ACCESS_TOKEN=... META_ADSET_ID=120251266112450131 node infra/meta-stock-sync.mjs
 *   META_ACCESS_TOKEN=... node infra/meta-stock-sync.mjs --dry-run
 *
 * Cloudflare Worker also runs this on stock changes + a 15-minute cron when
 * META_ACCESS_TOKEN is set as a Worker secret.
 */

const TOKEN = process.env.META_ACCESS_TOKEN;
const API = "https://graph.facebook.com/v21.0";
const SETTINGS_URL = process.env.YOLKO_SETTINGS_URL || "https://getyolko.com/api/settings";
const DEFAULT_ADSET_IDS = ["120251266112450131"]; // New Sales Ad Set — Sydney Markets 45 km
const STATE_FILE = process.env.META_STOCK_STATE_FILE ||
  `${process.env.HOME || "/tmp"}/.config/yolko/meta-stock-sync-state.json`;

const dryRun = process.argv.includes("--dry-run");

function adSetIds() {
  const raw = String(process.env.META_ADSET_IDS || process.env.META_ADSET_ID || "").trim();
  if (!raw) return DEFAULT_ADSET_IDS;
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

async function readState() {
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { pausedByStock: false };
  }
}

async function writeState(state) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2));
}

async function setAdSetStatus(id, status) {
  if (dryRun) {
    console.log(`[dry-run] would set ad set ${id} → ${status}`);
    return { success: true, dryRun: true };
  }
  const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: TOKEN }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`${id}: ${json.error.message}`);
  }
  return json;
}

async function main() {
  if (!TOKEN && !dryRun) {
    console.error("Set META_ACCESS_TOKEN (or pass --dry-run)");
    process.exit(1);
  }

  const settings = await fetch(SETTINGS_URL).then((r) => r.json());
  const trays = Math.max(0, Math.floor(Number(settings.traysAvailable) || 0));
  const ids = adSetIds();
  const state = await readState();

  console.log(`traysAvailable=${trays} (sold out when 0; box = 6 trays)`);
  console.log(`ad sets: ${ids.join(", ")}`);
  console.log(`pausedByStock flag: ${!!state.pausedByStock}`);

  if (trays <= 0) {
    for (const id of ids) {
      await setAdSetStatus(id, "PAUSED");
      console.log(`PAUSED ${id}`);
    }
    await writeState({ pausedByStock: true, trays });
    console.log("Stock sold out → ads paused.");
    return;
  }

  if (state.pausedByStock) {
    for (const id of ids) {
      await setAdSetStatus(id, "ACTIVE");
      console.log(`ACTIVE ${id}`);
    }
    await writeState({ pausedByStock: false, trays });
    console.log("Stock available again → ads resumed (we had paused them).");
    return;
  }

  console.log("No change (stock > 0 and we did not auto-pause).");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
