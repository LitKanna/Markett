#!/usr/bin/env node
/**
 * Opens Meta Ads Manager in the cloud desktop browser (DISPLAY :1).
 * User logs in via the Cursor Desktop view, then we automate ad creation.
 */
import { chromium } from "playwright";
import { existsSync, writeFileSync, unlinkSync } from "fs";

const ADS_URL =
  "https://adsmanager.facebook.com/adsmanager/manage/ads?act=1230148938407162&selected_adset_ids=120251266112450131";
const GO_SIGNAL = "/tmp/yolko-meta-ready";
const DONE_SIGNAL = "/tmp/yolko-meta-done";

const AD = {
  imageUrl: "https://getyolko.com/assets/social-eggs-1080.jpg",
  primary:
    "30 XL fresh eggs for $12. That's 40 cents an egg. Book your Pace Farm tray online now and pick it up at Paddy's Markets Flemington this coming Friday or Saturday. Pay online for priority, or pay at pickup.",
  headline: "30 Eggs $12 — Book Now, Pickup Fri/Sat",
  link: "https://getyolko.com/",
};

async function waitForLogin(page, maxMin = 15) {
  console.log("Waiting for Meta login (up to", maxMin, "min)…");
  const deadline = Date.now() + maxMin * 60 * 1000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (
      url.includes("adsmanager.facebook.com") &&
      !url.includes("login") &&
      !url.includes("checkpoint")
    ) {
      const body = await page.textContent("body").catch(() => "");
      if (body && (body.includes("Ad sets") || body.includes("Campaigns") || body.includes("Create"))) {
        console.log("Logged in — Ads Manager detected.");
        return true;
      }
    }
    await page.waitForTimeout(3000);
  }
  return false;
}

async function main() {
  if (existsSync(DONE_SIGNAL)) unlinkSync(DONE_SIGNAL);

  console.log("Launching browser on cloud desktop (DISPLAY :1)…");
  console.log("Open the **Desktop** panel in Cursor to see and control the browser.");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--start-maximized", "--no-first-run", "--disable-infobars"],
  });

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto(ADS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("\n>>> LOG IN NOW in the Desktop browser if prompted <<<\n");

  const loggedIn = await waitForLogin(page);
  if (!loggedIn) {
    console.log("Login timeout. Leave browser open — run again after logging in.");
    writeFileSync(GO_SIGNAL, "waiting");
    await page.waitForTimeout(600000);
    return;
  }

  console.log("Attempting to click Create…");
  await page.waitForTimeout(2000);

  const createBtn = page.getByRole("button", { name: /create/i }).first();
  if (await createBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await createBtn.click();
    console.log("Clicked Create — complete the ad form in Desktop, or automation continues…");
  } else {
    console.log("Create button not found — use Desktop browser manually from here.");
    console.log("Paste kit: ads/ads-manager-paste-kit.md");
  }

  writeFileSync(DONE_SIGNAL, new Date().toISOString());
  console.log("\nBrowser stays open. Toggle ad set ON when ad is published.");
  await page.waitForTimeout(3600000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
