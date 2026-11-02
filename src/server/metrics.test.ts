import { beforeEach, describe, expect, it } from "vitest";
import { recordCall, takeIntervalSnapshot } from "@/server/metrics";
import { renderTable, sparkline } from "@/server/metrics-reporter";

describe("takeIntervalSnapshot", () => {
  beforeEach(() => {
    takeIntervalSnapshot();
  });

  it("returns nothing when no calls happened in the interval", () => {
    expect(takeIntervalSnapshot()).toBeNull();
  });

  it("summarizes only the calls of the current interval", () => {
    for (const duration of [1, 2, 3, 4, 10]) recordCall("task.list", duration, true);
    recordCall("task.list", 5, false);

    const [list] = takeIntervalSnapshot()!.endpoints;

    expect(list).toMatchObject({ path: "task.list", calls: 6, errors: 1, avgMs: 25 / 6, p95Ms: 10, maxMs: 10 });

    recordCall("task.list", 7, true);
    expect(takeIntervalSnapshot()!.endpoints[0]).toMatchObject({ calls: 1, errors: 0, p95Ms: 7 });
  });

  it("keeps a p95 history with gaps for intervals without calls", () => {
    recordCall("task.byId", 2, true);
    takeIntervalSnapshot();
    takeIntervalSnapshot();
    recordCall("task.byId", 6, true);

    const byId = takeIntervalSnapshot()!.endpoints.find((endpoint) => endpoint.path === "task.byId");

    expect(byId?.p95History.slice(-3)).toEqual([2, null, 6]);
  });
});

describe("sparkline", () => {
  it("scales values from the lowest to the highest bar and marks gaps", () => {
    expect(sparkline([0, 50, null, 100])).toBe("▁▅·█");
  });

  it("renders a flat line when everything is zero", () => {
    expect(sparkline([0, 0])).toBe("▁▁");
  });
});

describe("renderTable", () => {
  it("pads every column to its widest cell", () => {
    expect(renderTable(["a", "bb"], [["ccc", "d"]])).toBe(
      ["┌─────┬────┐", "│ a   │ bb │", "├─────┼────┤", "│ ccc │ d  │", "└─────┴────┘"].join("\n"),
    );
  });
});
