const DEFAULT_METRICS_INTERVAL_MS = 10_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMetricsReporter } = await import("@/server/metrics-reporter");
  startMetricsReporter(Number(process.env.METRICS_INTERVAL_MS) || DEFAULT_METRICS_INTERVAL_MS);
}
