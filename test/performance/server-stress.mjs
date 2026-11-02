const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TARGET_TASKS = Number(process.argv[2] ?? 100_000);
const BATCH_SIZE = 50;
const READ_PAGE_SIZE = 50;
const MAX_READ_PAGES = 400;
const REPORT_EVERY = 200;

async function callTrpc(type, procedure, input) {
  const url = new URL(`/api/trpc/${procedure}`, BASE_URL);
  const init = { method: type === "query" ? "GET" : "POST", headers: { "content-type": "application/json" } };

  if (type === "query") url.searchParams.set("input", JSON.stringify({ json: input }));
  else init.body = JSON.stringify({ json: input });

  const start = performance.now();
  const response = await fetch(url, init);
  const durationMs = performance.now() - start;
  const body = await response.json();

  if (!response.ok) throw new Error(`${procedure} failed: ${JSON.stringify(body.error?.json ?? body)}`);
  return { data: body.result.data.json, durationMs };
}

function summarize(durations) {
  const sorted = durations.toSorted((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.floor(sorted.length * ratio)] ?? 0;
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return `n=${sorted.length} avg=${average.toFixed(1)}ms p95=${percentile(0.95).toFixed(1)}ms max=${sorted.at(-1).toFixed(1)}ms`;
}

async function generate() {
  console.log(`Generating ${TARGET_TASKS} tasks in batches of ${BATCH_SIZE} against ${BASE_URL}`);
  const durations = [];
  let created = 0;

  while (created < TARGET_TASKS) {
    const { data, durationMs } = await callTrpc("mutation", "task.generateBatch", { count: BATCH_SIZE });
    created += data.length;
    durations.push(durationMs);

    if (durations.length % REPORT_EVERY === 0) {
      console.log(`  ${created} created | last ${REPORT_EVERY} batches: ${summarize(durations.slice(-REPORT_EVERY))}`);
    }
  }
  console.log(`Generation done: ${summarize(durations)}`);
}

async function readFromOldest() {
  console.log(`Reading up to ${MAX_READ_PAGES} pages, starting from the oldest tasks`);
  const durations = [];
  let cursor = null;

  for (let page = 0; page < MAX_READ_PAGES; page++) {
    const input = { limit: READ_PAGE_SIZE, cursor, orderBy: [{ field: "dataCriacao", direction: "asc" }] };
    const { data, durationMs } = await callTrpc("query", "task.list", input);
    durations.push(durationMs);
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  console.log(`Reading done: ${summarize(durations)}`);
}

try {
  await fetch(BASE_URL);
} catch {
  console.error(`\n✖ The app is not reachable at ${BASE_URL}. Start it first: docker compose up -d\n`);
  process.exit(1);
}

await generate();
await readFromOldest();
