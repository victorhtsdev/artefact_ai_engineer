# Performance tests

Optional tests: they are not part of `npm test` or the Docker image. Both need the app running (`docker compose up -d`).

| Test | Command | Question it answers |
|---|---|---|
| [1. Server stress](#1-server-stress) | `npm run test:stress` | Does the server hold up with volume? |
| [2. Browser scrolling](#2-browser-scrolling) | `npm run test:perf` | Does the list stay smooth as it grows? |

## 1. Server stress

`test/performance/server-stress.mjs` calls the tRPC API directly over HTTP, without a browser.

I built this stress test to check whether the server sustains a high volume of tasks and requests. It stays available as a tool to **find server bottlenecks for a given load**: adjust the number of tasks (or the batch and page sizes at the top of the script) to simulate the expected load and watch latency and memory.

### How to run

```bash
npm run test:stress           # 100,000 tasks (default)
npm run test:stress -- 10000  # another amount
```

### What it does

1. **Generation:** creates the tasks in batches of 50 (`task.generateBatch`), printing average, p95 and max latency every 200 batches.
2. **Reading:** pages through up to 400 pages of 50, starting from the **oldest** tasks (`dataCriacao asc`), like a user going through the whole list.

Latencies are measured on the client (HTTP included). To watch server memory at the same time, follow the `[metrics]` summary in the log: `docker compose logs -f app`.

### Result (2026-11-01, 100,000 tasks)

| Phase | Requests | Average | p95 | Max |
|---|---|---|---|---|
| Generation (batches of 50) | 2,000 | 5.4 ms | 7.7 ms | 117 ms (first one, warm-up) |
| Reading (from the oldest) | 400 | 5.2 ms | 7.0 ms | 38 ms |

- Stable latency from start to finish, no errors. On the server each call took ~1 ms (the rest is HTTP).
- Server memory: ~95 MB with 100,000 tasks, plenty of headroom to keep everything in memory.
- **Conclusion:** the server is not a bottleneck at the tested volume. That is what pointed the investigation to the browser (test 2).

## 2. Browser scrolling

I built this test to solve a problem I noticed while testing the app by hand. It measures, in a real browser, the list rendering approaches in generate mode (`/?mode=generate`), where scrolling to the end creates new tasks on the server. It was the basis for the decision recorded at the end of this section: **adopt virtualization**.

### Observed problem

Testing the app in the browser, I noticed that, holding **Page Down**, task generation got slower and slower as the list grew. The server metrics (periodic summary in the container log) showed `task.generateBatch` steady at ~1 ms, but receiving **fewer and fewer calls**: the server answered quickly, and it was the browser taking longer and longer to process each batch and request the next one. To compare solutions with data rather than impressions, I built this test.

### How to run

```bash
npx playwright install chromium      # first time only
npm run test:perf                    # virtualized list (~1 min)
```

Each 10 s window is printed in the terminal while the test runs; at the end it prints a summary table, the markdown tables used below, and the raw data in `bench-results/` (not versioned). Duration and window are configurable: `BENCH_DURATION_MS`, `BENCH_WINDOW_MS`.

### Methodology

Automated benchmark in `test/performance/scroll-benchmark.mjs`.

- Headless Chromium (Playwright), 1280×800 window.
- Opens `/?mode=generate` and presses **Page Down every 30 ms for 60 s**.
- The container is restarted before each approach, so all of them start with the same 25 sample tasks.
- Samples every 10 s:

| Metric | What it shows |
|---|---|
| Batches in the window | Generation pace (each batch = 20 tasks), the main metric |
| Tasks | List size at sample time |
| `<article>` in the DOM | How many items are actually rendered |
| JS heap (MB) | Browser JavaScript memory (`performance.memory`) |
| Long tasks (ms) | Time the page was blocked (JS tasks > 50 ms) within the 10 s window |

Absolute numbers depend on the machine; what matters is the comparison between approaches on the same machine and the **trend** over time.

### Approaches

#### A — `plain`: render every task

One `<li>` per task; the next infinite query page is triggered by a sentinel at the end of the list (`IntersectionObserver`, 1.5 screens ahead).

#### B — `virtual`: virtualization with `@tanstack/react-virtual`

Only the visible tasks plus 5 of margin stay in the DOM (`useWindowVirtualizer`, height measured per item). Generation is triggered when the last rendered item is fewer than 20 from the end. SSR still delivers the first page in the HTML (`initialRect`).

### Results (2026-11-01)

#### Round 2 — target of 10,000 tasks (max. 5 min per approach)

`BENCH_TARGET_TASKS=10000 BENCH_DURATION_MS=300000 npm run test:perf`

| approach | time | tasks | batches 1st window | batches last | drop | max DOM | peak browser heap (MB) | total blocked |
|---|---|---|---|---|---|---|---|---|
| plain | 300 s (limit) | **7,545**, did not reach it | 52 | 6 | 88 % | 7,545 | 430.1 | 215.8 s of 300 s (72 %) |
| virtual | **90 s** | 10,645 | 86 | 39 | 55 % | 18 | 58.2 | 13.1 s of 90 s (15 %) |

##### A — plain (samples every ~30 s; full series in `bench-results/`)

| s | batches in window | tasks | `<article>` in DOM | browser JS heap (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 52 | 1065 | 1065 | 38.1 | 0 |
| 30 | 23 | 2245 | 2245 | 162.9 | 7181 |
| 61 | 14 | 3265 | 3265 | 81.5 | 7311 |
| 92 | 13 | 4105 | 4105 | 183.6 | 7753 |
| 122 | 10 | 4765 | 4765 | 149.2 | 7664 |
| 153 | 9 | 5345 | 5345 | 86.9 | 8045 |
| 185 | 9 | 5905 | 5905 | 220.9 | 8353 |
| 217 | 6 | 6365 | 6365 | 128.1 | 8806 |
| 247 | 8 | 6845 | 6845 | 430.1 | 8068 |
| 279 | 7 | 7305 | 7305 | 188.3 | 8418 |
| 300 | 6 | 7545 | 7545 | 424.0 | 8780 |

##### B — virtual

| s | batches in window | tasks | `<article>` in DOM | browser JS heap (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 86 | 1745 | 17 | 13.8 | 0 |
| 20 | 82 | 3385 | 18 | 41.2 | 0 |
| 30 | 71 | 4805 | 17 | 50.3 | 0 |
| 40 | 57 | 5925 | 18 | 26.7 | 121 |
| 50 | 59 | 7125 | 18 | 39.2 | 54 |
| 60 | 49 | 8105 | 17 | 56.4 | 1689 |
| 70 | 44 | 8985 | 18 | 58.2 | 3135 |
| 80 | 44 | 9865 | 18 | 43.3 | 3580 |
| 90 | 39 | 10645 | 17 | 48.3 | 4504 |

#### Round 1 — 60 s per approach

##### A — plain

| s | batches in window | tasks | `<article>` in DOM | JS heap (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 49 | 985 | 985 | 32.9 | 105 |
| 20 | 32 | 1645 | 1645 | 54.3 | 5289 |
| 31 | 25 | 2145 | 2145 | 120.1 | 6872 |
| 41 | 21 | 2545 | 2545 | 196.4 | 7215 |
| 51 | 17 | 2905 | 2905 | 195.3 | 7542 |

##### B — virtual

| s | batches in window | tasks | `<article>` in DOM | JS heap (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 85 | 1725 | 17 | 13.1 | 0 |
| 20 | 80 | 3325 | 18 | 30.4 | 0 |
| 30 | 71 | 4745 | 18 | 44.7 | 0 |
| 40 | 62 | 5985 | 18 | 46.4 | 236 |
| 50 | 50 | 6985 | 18 | 26.4 | 1141 |

##### Comparison at the same number of tasks

| ~tasks | plain: batches/10 s | plain: blocked | virtual: batches/10 s | virtual: blocked |
|---|---|---|---|---|
| ~1,000–1,700 | 49 → 32 | 0.1 s → 5.3 s | 85 | 0 s |
| ~2,900–3,300 | 17 | 7.5 s of 10 s | 80 | 0 s |
| ~7,000 | — | — | 50 | 1.1 s |

### Analysis

"Heap" always means the **browser's** JavaScript memory (`performance.memory`). Server memory shows up in the `[metrics]` summary in the container log.

- **plain:** the cost of each batch grows with the total (the whole DOM plus a re-render of every item). From ~2,200 tasks on, the page is **blocked ~75–88 % of each window**; in 5 minutes it **does not reach 10,000** (it stopped at 7,545, generating only 6 batches/10 s) and the browser heap swings between 80 and 430 MB (the GC can't keep up).
- **virtual:** constant DOM (~18 items), browser heap under 60 MB, **reaches 10,000 in 90 s** (≥ 3.3× faster; plain never got there). At the same volume (~7,000) it generates **~8× more batches** (59 vs 7).
- **Virtual degrades too**, and the 10,000 round makes that clear: 86 → 39 batches/10 s, and blocked time rises from ~0 to **4.5 s per window (45 %) near 10,000**. An O(n) per-batch cost remains outside the DOM. Suspects to investigate: React Query *structural sharing* in `setQueryData` (it compares the whole cache on every batch) and the virtualizer recomputing the positions of every item.

### Decision

**Approach B, virtualization (`@tanstack/react-virtual`), was adopted.** It is the app's list. Approach A was removed from the code after this comparison; to reproduce it, use the commit before "Remove the non-virtualized list".

Reasons, from the data:

- **It fixes the observed problem:** it reached 10,000 tasks in 90 s; the non-virtualized list did not reach it in 5 minutes (it stopped at 7,545).
- **Constant rendering cost:** ~18 items in the DOM at any volume, versus thousands with approach A.
- **Pace and smoothness:** at the same volume (~7,000 tasks), ~8× more batches generated and little blocking, while approach A was blocked ~75–88 % of each window.
- **Browser memory:** 58 MB peak, versus 430 MB.
- **SSR preserved:** the first page still comes in the server HTML.

#### Known limitation

Above ~7,000 loaded tasks, processing each batch in the browser gets heavy again (up to 45 % of a window blocked near 10,000). The DOM stays small; the cost comes from every loaded task staying in memory on the client. Real use of the list doesn't reach that volume; only the generate mode does, and it is a demonstration.
