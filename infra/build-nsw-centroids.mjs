// Build a compact NSW suburb-centroid bundle for delivery-zones.mjs.
//
// Source: Matthew Proctor Australian Postcodes
//   https://github.com/matthewproctor/australianpostcodes
//
// Usage:
//   node infra/build-nsw-centroids.mjs
//   node infra/build-nsw-centroids.mjs /path/to/australian_postcodes.csv
//
// No runtime download. This script is for regenerating the committed bundle.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "nsw-suburb-centroids.mjs");
const SOURCE_URL =
  "https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv";
const SOURCE_REPO = "https://github.com/matthewproctor/australianpostcodes";

const HUB = { lat: -33.8667, lng: 151.0694 };
const MAX_STRAIGHT_KM = 100;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function titleCase(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/(^|[\s'/()-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadCsv(csvPath) {
  if (csvPath) return readFile(csvPath, "utf8");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function collectLocalities(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const col of ["postcode", "locality", "state", "long", "lat", "type"]) {
    if (idx[col] == null) throw new Error(`CSV missing column ${col}`);
  }

  const grouped = new Map();
  for (const r of rows.slice(1)) {
    const state = String(r[idx.state] || "").trim().toUpperCase();
    if (state !== "NSW") continue;
    const type = String(r[idx.type] || "").trim();
    if (type && type !== "Delivery Area") continue;

    const postcode = String(r[idx.postcode] || "").replace(/\D/g, "");
    if (!/^2\d{3}$/.test(postcode)) continue;

    const locality = String(r[idx.locality] || "").trim();
    if (!locality) continue;

    const latPrecise = parseFloat(r[idx.Lat_precise]);
    const lngPrecise = parseFloat(r[idx.Long_precise]);
    const latFallback = parseFloat(r[idx.lat]);
    const lngFallback = parseFloat(r[idx.long]);
    const lat = Number.isFinite(latPrecise) && latPrecise !== 0 ? latPrecise : latFallback;
    const lng = Number.isFinite(lngPrecise) && lngPrecise !== 0 ? lngPrecise : lngFallback;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
    if (haversineKm(HUB.lat, HUB.lng, lat, lng) > MAX_STRAIGHT_KM) continue;

    const key = normName(locality);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      name: titleCase(locality),
      lat,
      lng,
      postcode,
    });
  }

  const out = [];
  for (const rowsForName of grouped.values()) {
    const clusters = clusterRows(rowsForName);
    for (const cluster of clusters) {
      const postcodes = [...new Set(cluster.map((x) => x.postcode))].sort();
      const lat = cluster.reduce((s, x) => s + x.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, x) => s + x.lng, 0) / cluster.length;
      out.push({
        name: cluster[0].name,
        lat: +lat.toFixed(5),
        lng: +lng.toFixed(5),
        postcodes,
      });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name) || a.postcodes[0].localeCompare(b.postcodes[0]));
  return out;
}

function clusterRows(rows) {
  const clusters = [];
  for (const row of rows) {
    let placed = false;
    for (const cluster of clusters) {
      const far = cluster.some((x) => haversineKm(x.lat, x.lng, row.lat, row.lng) > 15);
      if (!far) {
        cluster.push(row);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([row]);
  }
  return clusters;
}

function renderBundle(localities) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const lines = localities.map((s) => `  ${JSON.stringify([s.name, s.lat, s.lng, ...s.postcodes])},`);
  return `// Generated NSW suburb centroids for YOLKO delivery checks.
// Do not edit by hand. Regenerate with: node infra/build-nsw-centroids.mjs
//
// Source: Matthew Proctor Australian Postcodes
//   ${SOURCE_REPO}
// Filtered to NSW Delivery Area localities within ${MAX_STRAIGHT_KM} km
// (straight-line) of Paddy's Markets Flemington.
//
// generated: ${generatedAt}
// count: ${localities.length}

export const NSW_CENTROID_META = {
  source: ${JSON.stringify(SOURCE_REPO)},
  sourceFile: "australian_postcodes.csv",
  generatedAt: ${JSON.stringify(generatedAt)},
  maxStraightKm: ${MAX_STRAIGHT_KM},
  hubLat: ${HUB.lat},
  hubLng: ${HUB.lng},
  count: ${localities.length},
};

// Each row: [name, lat, lng, ...postcodes]
export default [
${lines.join("\n")}
];
`;
}

const csvPath = process.argv[2];
const csvText = await loadCsv(csvPath);
const localities = collectLocalities(csvText);
await writeFile(OUT, renderBundle(localities));
console.log(`Wrote ${localities.length} NSW localities to ${path.relative(process.cwd(), OUT)}`);
const prove = ["Padstow", "Revesby", "Panania", "Bankstown", "Liverpool", "Hurstville", "Penrith", "Gosford"];
for (const name of prove) {
  const hit = localities.find((s) => s.name === name);
  console.log(hit ? `  ${hit.name} ${hit.postcodes.join("/")} ${hit.lat},${hit.lng}` : `  MISSING ${name}`);
}
