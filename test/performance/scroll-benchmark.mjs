import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CONTAINER = process.env.BENCH_CONTAINER ?? "artefact_ai_engineer-app-1";
const DURATION_MS = Number(process.env.BENCH_DURATION_MS ?? 60_000);
const WINDOW_MS = Number(process.env.BENCH_WINDOW_MS ?? 10_000);
const TARGET_TASKS = Number(process.env.BENCH_TARGET_TASKS ?? Infinity);
const KEY_INTERVAL_MS = 30;
const SEEDED_TASKS = 25;
const VIEWPORT = { width: 1280, height: 800 };
const RESULTS_DIR = "bench-results";

// The non-virtualized "plain" list was removed from the app after the comparison in test/README.md.
// To rerun it, check out the commit before "Remove the non-virtualized list".
const approaches = ["virtual"];

const WINDOW_COLUMNS = [
  { label: "time", width: 6 },
  { label: "batches", width: 8 },
  { label: "tasks", width: 7 },
  { label: "DOM items", width: 10 },
  { label: "browser heap", width: 13 },
  { label: "blocked", width: 9 },
];

const SUMMARY_COLUMNS = [
  { key: "approach", label: "approach", width: 10 },
  { key: "seconds", label: "time", width: 6 },
  { key: "totalTasks", label: "tasks", width: 7 },
  { key: "firstBatches", label: "1st window", width: 11 },
  { key: "lastBatches", label: "last window", width: 12 },
  { key: "drop", label: "drop", width: 6 },
  { key: "maxDom", label: "max DOM", width: 8 },
  { key: "peakHeapMb", label: "peak browser heap MB", width: 21 },
  { key: "blockedMs", label: "blocked ms", width: 11 },
];

const row = (columns, cells) => cells.map((cell, index) => cell.padStart(columns[index].width)).join(" │ ");

const sampleCells = (sample) => [
  `${sample.second}s`,
  String(sample.batches),
  String(sample.totalTasks),
  String(sample.domItems),
  `${sample.heapMb}MB`,
  `${sample.longTaskMs}ms`,
];

async function restartServer() {
  execSync(`docker restart ${CONTAINER}`, { stdio: "ignore" });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${BASE_URL} did not come back after restart`);
}

async function runApproach(browser, approach) {
  await restartServer();

  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(() => {
    window.__longTaskMs = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTaskMs += entry.duration;
    }).observe({ type: "longtask", buffered: true });
  });

  let generatedTasks = 0;
  let batches = 0;
  page.on("response", async (response) => {
    if (!response.url().includes("task.generateBatch") || !response.ok()) return;
    batches++;
    try {
      const [result] = await response.json();
      generatedTasks += result.result.data.json.length;
    } catch {}
  });

  await page.goto(`${BASE_URL}/?mode=generate`, { waitUntil: "networkidle" });
  await page.locator("article").first().waitFor();

  const windows = [];
  const start = Date.now();
  let windowStart = start;
  let previous = { batches: 0, longTaskMs: 0 };

  while (Date.now() - start < DURATION_MS && (windows.at(-1)?.totalTasks ?? 0) < TARGET_TASKS) {
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(KEY_INTERVAL_MS);

    if (Date.now() - windowStart < WINDOW_MS) continue;

    const browserStats = await page.evaluate(() => ({
      domItems: document.querySelectorAll("article").length,
      heapMb: performance.memory.usedJSHeapSize / 1024 / 1024,
      longTaskMs: window.__longTaskMs,
      scrollY: window.scrollY,
    }));
    const sample = {
      second: Math.round((Date.now() - start) / 1000),
      batches: batches - previous.batches,
      totalTasks: SEEDED_TASKS + generatedTasks,
      domItems: browserStats.domItems,
      heapMb: Number(browserStats.heapMb.toFixed(1)),
      longTaskMs: Math.round(browserStats.longTaskMs - previous.longTaskMs),
      scrollY: Math.round(browserStats.scrollY),
    };
    windows.push(sample);
    console.log(row(WINDOW_COLUMNS, sampleCells(sample)));
    previous = { batches, longTaskMs: browserStats.longTaskMs };
    windowStart = Date.now();
  }

  await page.close();
  return windows;
}

function summarize(approach, windows) {
  const first = windows[0];
  const last = windows.at(-1);
  return {
    approach,
    seconds: `${last.second}s`,
    totalTasks: last.totalTasks,
    firstBatches: first.batches,
    lastBatches: last.batches,
    drop: `${Math.round((1 - last.batches / first.batches) * 100)}%`,
    maxDom: Math.max(...windows.map((w) => w.domItems)),
    peakHeapMb: Math.max(...windows.map((w) => w.heapMb)),
    blockedMs: windows.reduce((sum, w) => sum + w.longTaskMs, 0),
  };
}

function markdownTable(approach, windows) {
  const header = "| s | lotes na janela | tarefas | `<article>` no DOM | heap JS do navegador (MB) | long tasks (ms) |";
  const divider = "|---|---|---|---|---|---|";
  const rows = windows.map(
    (w) => `| ${w.second} | ${w.batches} | ${w.totalTasks} | ${w.domItems} | ${w.heapMb} | ${w.longTaskMs} |`,
  );
  return [`### ${approach}`, "", header, divider, ...rows].join("\n");
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

try {
  await fetch(BASE_URL);
} catch {
  fail(`The app is not reachable at ${BASE_URL}. Start it first: docker compose up -d`);
}

const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] }).catch((error) => {
  if (String(error).includes("Executable doesn't exist")) {
    fail("Chromium for Playwright is not installed. Run once: npx playwright install chromium");
  }
  throw error;
});
const runs = {};
const startedAt = new Date().toISOString();

for (const approach of approaches) {
  const goal = Number.isFinite(TARGET_TASKS)
    ? `until ${TARGET_TASKS} tasks (max ${DURATION_MS / 1000}s)`
    : `for ${DURATION_MS / 1000}s`;
  console.log(`\n▶ ${approach}: PageDown every ${KEY_INTERVAL_MS}ms ${goal} (restarting server first)`);
  console.log(row(WINDOW_COLUMNS, WINDOW_COLUMNS.map((column) => column.label)));
  runs[approach] = await runApproach(browser, approach);
}
await browser.close();

const summaries = Object.entries(runs).map(([approach, windows]) => summarize(approach, windows));
console.log("\n■ Comparison");
console.log(row(SUMMARY_COLUMNS, SUMMARY_COLUMNS.map((column) => column.label)));
for (const summary of summaries) {
  console.log(row(SUMMARY_COLUMNS, SUMMARY_COLUMNS.map((column) => String(summary[column.key]))));
}

await mkdir(RESULTS_DIR, { recursive: true });
const file = `${RESULTS_DIR}/scroll-${startedAt.replace(/[:.]/g, "-")}.json`;
await writeFile(file, JSON.stringify({ startedAt, durationMs: DURATION_MS, windowMs: WINDOW_MS, viewport: VIEWPORT, runs }, null, 2));

console.log(`\nRaw results saved to ${file}\n`);
console.log(Object.entries(runs).map(([approach, windows]) => markdownTable(approach, windows)).join("\n\n"));
