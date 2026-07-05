#!/usr/bin/env node
/**
 * Generate design assets from Higgsfield and save them under assets/generated/higgsfield/.
 *
 * Real product photos (assets/references/*.png) are never touched unless you
 * explicitly point a job output there in infra/higgsfield.config.json.
 *
 * Setup:
 * 1. Create API keys at https://cloud.higgsfield.ai/api-keys
 * 2. Export credentials locally or add GitHub secrets:
 *      HF_CREDENTIALS = KEY_ID:KEY_SECRET
 *    or HF_API_KEY + HF_API_SECRET
 * 3. Enable a job in infra/higgsfield.config.json (enabled: true)
 * 4. Run: npm run higgsfield:sync
 *
 * Options:
 *   --list          Show configured jobs
 *   --job <id>      Run one job (ignores enabled flag)
 *   --dry-run       Print jobs without calling the API
 */
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(__dirname, "higgsfield.config.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const listOnly = args.includes("--list");
const jobFlagIndex = args.indexOf("--job");
const jobFilter = jobFlagIndex >= 0 ? args[jobFlagIndex + 1] : null;

function credentialsFromEnv() {
  if (process.env.HF_CREDENTIALS) return process.env.HF_CREDENTIALS;
  const key = process.env.HF_API_KEY;
  const secret = process.env.HF_API_SECRET;
  if (key && secret) return `${key}:${secret}`;
  return null;
}

function parseConfig(raw) {
  const config = JSON.parse(raw);
  if (!config?.jobs?.length) {
    throw new Error("higgsfield.config.json must include a non-empty jobs array");
  }
  return config;
}

function selectJobs(config) {
  if (jobFilter) {
    const job = config.jobs.find((entry) => entry.id === jobFilter);
    if (!job) {
      throw new Error(`Unknown job "${jobFilter}". Use --list to see available jobs.`);
    }
    return [job];
  }
  return config.jobs.filter((job) => job.enabled);
}

function printJobs(config) {
  console.log("Higgsfield jobs (infra/higgsfield.config.json):\n");
  for (const job of config.jobs) {
    const status = job.enabled ? "enabled" : "disabled";
    console.log(`  ${job.id} [${status}]`);
    console.log(`    ${job.description || job.endpoint}`);
    console.log(`    → ${path.join(config.assetsDir, job.output)}\n`);
  }
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
}

async function updateManifest(config, results) {
  const manifestPath = path.join(ROOT, config.assetsDir, "manifest.json");
  let manifest = { version: 1, updatedAt: null, jobs: {} };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    // first run
  }

  manifest.updatedAt = new Date().toISOString();
  for (const entry of results) {
    manifest.jobs[entry.id] = {
      output: entry.output,
      requestId: entry.requestId,
      sourceUrl: entry.sourceUrl,
      generatedAt: entry.generatedAt,
    };
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runJob(client, config, job) {
  const assetsDir = path.join(ROOT, config.assetsDir);
  const outputPath = path.join(assetsDir, job.output);

  console.log(`→ ${job.id}`);
  console.log(`  endpoint: ${job.endpoint}`);
  console.log(`  output:   ${path.relative(ROOT, outputPath)}`);

  if (dryRun) return null;

  const jobSet = await client.subscribe(job.endpoint, {
    input: job.input,
    withPolling: true,
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Job "${job.id}" did not complete (status: ${jobSet.jobs[0]?.status || "unknown"})`);
  }

  const resultUrl = jobSet.jobs[0]?.results?.raw?.url;
  if (!resultUrl) {
    throw new Error(`Job "${job.id}" completed without a result URL`);
  }

  await mkdir(assetsDir, { recursive: true });
  await downloadToFile(resultUrl, outputPath);

  console.log(`  saved:    ${path.relative(ROOT, outputPath)}`);
  console.log(`  request:  ${jobSet.id}`);

  return {
    id: job.id,
    output: job.output,
    requestId: jobSet.id,
    sourceUrl: resultUrl,
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const config = parseConfig(await readFile(CONFIG_PATH, "utf8"));

  if (listOnly) {
    printJobs(config);
    return;
  }

  const jobs = selectJobs(config);
  if (!jobs.length) {
    console.log("Higgsfield: no enabled jobs.");
    console.log("Enable a job in infra/higgsfield.config.json or run with --job <id>.");
    console.log("Use --list to see available jobs.");
    return;
  }

  if (dryRun) {
    console.log("Higgsfield dry run:\n");
    for (const job of jobs) {
      await runJob(null, config, job);
    }
    return;
  }

  const credentials = credentialsFromEnv();
  if (!credentials) {
    console.log("Higgsfield: skipped (set HF_CREDENTIALS or HF_API_KEY + HF_API_SECRET)");
    console.log("Create keys at https://cloud.higgsfield.ai/api-keys");
    process.exit(0);
  }

  const client = createHiggsfieldClient({ credentials });
  const results = [];

  for (const job of jobs) {
    results.push(await runJob(client, config, job));
  }

  await updateManifest(config, results);
  console.log(`\nHiggsfield: ${results.length} asset(s) synced to ${config.assetsDir}/`);
}

main().catch((error) => {
  console.error("Higgsfield sync failed:", error.message || error);
  process.exit(1);
});
