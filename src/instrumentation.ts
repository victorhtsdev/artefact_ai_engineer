const DEFAULT_METRICS_INTERVAL_MS = 10_000;

// Runs once when the server starts. The dynamic import keeps Node-only code out of the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMetricsReporter } = await import("@/server/metrics-reporter");
  startMetricsReporter(Number(process.env.METRICS_INTERVAL_MS) || DEFAULT_METRICS_INTERVAL_MS);
}
