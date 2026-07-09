#!/usr/bin/env node
/**
 * Submit sitemap to Google Search Console via the Webmasters API.
 *
 * Setup (one time):
 * 1. Google Cloud → enable "Google Search Console API"
 * 2. Create a service account → download JSON key
 * 3. Search Console → Settings → Users → add the service account email (Full)
 * 4. GitHub secret: GOOGLE_SERVICE_ACCOUNT_JSON = entire JSON file contents
 *
 * Optional env:
 *   GOOGLE_SEARCH_CONSOLE_SITE_URL  default https://getyolko.com/
 *   GOOGLE_SITEMAP_URL              default https://getyolko.com/sitemap.xml
 */
import { GoogleAuth } from "google-auth-library";

const SITE_URL = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "https://getyolko.com/";
const SITEMAP_URL = process.env.GOOGLE_SITEMAP_URL || "https://getyolko.com/sitemap.xml";
const SCOPE = "https://www.googleapis.com/auth/webmasters";

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.log("Google Search Console: skipped (GOOGLE_SERVICE_ACCOUNT_JSON not set)");
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(raw);
} catch {
  console.error("Google Search Console: invalid GOOGLE_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
const client = await auth.getClient();
const { token } = await client.getAccessToken();
if (!token) {
  console.error("Google Search Console: failed to obtain access token");
  process.exit(1);
}

const site = encodeURIComponent(SITE_URL);
const feed = encodeURIComponent(SITEMAP_URL);
const api = `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${feed}`;

const res = await fetch(api, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}` },
});

const body = await res.text();
if (res.ok) {
  console.log("Google Search Console: sitemap submitted", SITEMAP_URL, res.status);
} else {
  console.error("Google Search Console: submit failed", res.status, body || res.statusText);
  process.exit(1);
}
