import { getHeapStatistics } from "node:v8";
import { type IntervalSnapshot, LATENCY_BUDGET_MS, takeIntervalSnapshot } from "@/server/metrics";

const BYTES_IN_MB = 1024 * 1024;
const SPARK_LEVELS = "▁▂▃▄▅▆▇█";
const EMPTY_POINT = "·";

const formatMb = (bytes: number) => `${(bytes / BYTES_IN_MB).toFixed(1)}MB`;
const formatMs = (value: number) => `${value.toFixed(1)}ms`;

export function sparkline(values: (number | null)[]): string {
  const max = Math.max(0, ...values.filter((value) => value !== null));
  const top = SPARK_LEVELS.length - 1;

  return values
    .map((value) => (value === null ? EMPTY_POINT : SPARK_LEVELS[max === 0 ? 0 : Math.round((value / max) * top)]))
    .join("");
}

export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => row[column].length)));
  const border = (left: string, middle: string, right: string) =>
    left + widths.map((width) => "─".repeat(width + 2)).join(middle) + right;
  const line = (cells: string[]) => `│${cells.map((cell, column) => ` ${cell.padEnd(widths[column])} `).join("│")}│`;

  return [border("┌", "┬", "┐"), line(headers), border("├", "┼", "┤"), ...rows.map(line), border("└", "┴", "┘")].join(
    "\n",
  );
}

function renderSummary({ taskCount }: IntervalSnapshot, intervalMs: number): string {
  const { heapUsed, rss } = process.memoryUsage();
  const heapLimit = getHeapStatistics().heap_size_limit;
  const time = new Date().toISOString().slice(11, 19);

  const parts = [
    `[metrics] ${time} UTC`,
    `last ${intervalMs / 1000}s`,
    `heap ${formatMb(heapUsed)}/${formatMb(heapLimit)} (${Math.round((heapUsed / heapLimit) * 100)}%)`,
    `rss ${formatMb(rss)}`,
  ];
  if (taskCount !== undefined) parts.push(`tasks ${taskCount}`);
  return parts.join(" · ");
}

function report(intervalMs: number): void {
  const snapshot = takeIntervalSnapshot();
  if (!snapshot) return;

  const rows = snapshot.endpoints.map((endpoint) => [
    endpoint.path,
    String(endpoint.calls),
    String(endpoint.errors),
    formatMs(endpoint.avgMs),
    formatMs(endpoint.p95Ms),
    formatMs(endpoint.maxMs),
    sparkline(endpoint.p95History),
  ]);
  const headers = ["endpoint", "calls", "errors", "avg", "p95", "max", "p95 trend"];
  console.info(`${renderSummary(snapshot, intervalMs)}\n${renderTable(headers, rows)}`);

  for (const endpoint of snapshot.endpoints) {
    if (endpoint.p95Ms > LATENCY_BUDGET_MS) {
      console.warn(
        `[metrics] ${endpoint.path} p95 ${formatMs(endpoint.p95Ms)} is above the ${LATENCY_BUDGET_MS}ms budget`,
      );
    }
  }
}

export function startMetricsReporter(intervalMs: number): void {
  const globalForReporter = globalThis as unknown as { metricsReporter?: NodeJS.Timeout };
  if (globalForReporter.metricsReporter) return;

  globalForReporter.metricsReporter = setInterval(() => report(intervalMs), intervalMs).unref();
}
