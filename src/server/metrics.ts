export const LATENCY_BUDGET_MS = 50;

const HISTORY_SIZE = 30;

export type EndpointStats = {
  path: string;
  calls: number;
  errors: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  p95History: (number | null)[];
};

export type IntervalSnapshot = {
  endpoints: EndpointStats[];
  taskCount?: number;
};

type MetricsState = {
  calls: Map<string, { durations: number[]; errors: number }>;
  p95History: Map<string, (number | null)[]>;
  taskCount?: () => number;
};

// On globalThis because Next bundles instrumentation.ts and the API route separately;
// plain module state would give each bundle its own copy and the summary would always be empty.
const globalForMetrics = globalThis as unknown as { metrics?: MetricsState };
const state: MetricsState = (globalForMetrics.metrics ??= { calls: new Map(), p95History: new Map() });

export function recordCall(path: string, durationMs: number, ok: boolean): void {
  let entry = state.calls.get(path);
  if (!entry) {
    entry = { durations: [], errors: 0 };
    state.calls.set(path, entry);
  }
  entry.durations.push(durationMs);
  if (!ok) entry.errors++;
}

export function registerTaskCount(provider: () => number): void {
  state.taskCount = provider;
}

const percentile = (sorted: number[], ratio: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];

export function takeIntervalSnapshot(): IntervalSnapshot | null {
  const intervalCalls = state.calls;
  state.calls = new Map();

  for (const path of intervalCalls.keys()) {
    if (!state.p95History.has(path)) state.p95History.set(path, []);
  }

  const endpoints: EndpointStats[] = [];
  for (const [path, history] of state.p95History) {
    const entry = intervalCalls.get(path);
    const sorted = entry ? entry.durations.toSorted((a, b) => a - b) : [];
    const p95Ms = sorted.length > 0 ? percentile(sorted, 0.95) : null;

    history.push(p95Ms);
    if (history.length > HISTORY_SIZE) history.shift();

    if (entry && p95Ms !== null) {
      endpoints.push({
        path,
        calls: sorted.length,
        errors: entry.errors,
        avgMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p95Ms,
        maxMs: sorted[sorted.length - 1],
        p95History: [...history],
      });
    }
  }

  if (endpoints.length === 0) return null;
  return { endpoints: endpoints.toSorted((a, b) => a.path.localeCompare(b.path)), taskCount: state.taskCount?.() };
}
