import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  fromExecutionTrace,
  renderExecutionTrace,
  type ExecutionTrace,
  type Timeline,
} from "../src/index.ts";

/*
 * The recorded runs under traces/runtime: the real RxJS 7 operators traced
 * by rxjs-execution-debugger under TestScheduler virtual time. These tests
 * pin what each animation says about its scenario.
 */

const NAMES = [
  "mergeMap_stale_inner",
  "switchMap_cancels_inner",
  "concatMap_stall",
  "shareReplay_leak",
  "share_resets",
  "combineLatest_silentB",
] as const;

const load = (name: string): ExecutionTrace =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../traces/runtime/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as ExecutionTrace;

const marks = (tl: Timeline, lane: string): (string | number)[][] =>
  tl.marks
    .filter((m) => m.lane === lane)
    .map((m) => [m.column, m.kind, m.label]);

const last = (trace: ExecutionTrace) => {
  const set = fromExecutionTrace(trace);
  return set.frames[set.frames.length - 1];
};

describe("mergeMap_stale_inner", () => {
  const trace = load("mergeMap_stale_inner");
  const set = fromExecutionTrace(trace);
  const tl = buildTimeline(set);

  it("orders lanes source, inner[1], inner[2], sink", () => {
    expect(set.lanes.map((l) => l.name)).toEqual([
      "source",
      "inner[1]",
      "inner[2]",
      "sink",
    ]);
    expect(set.columnLabels).toEqual(["0ms", "10ms", "20ms", "30ms", "50ms"]);
  });

  it("shows the first inner delivering 1.2 after the second inner has started", () => {
    expect(marks(tl, "inner[1]")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "1.1"],
      [3, "value", "1.2"],
      [3, "complete", "complete"],
    ]);
    expect(marks(tl, "inner[2]")).toEqual([
      [2, "subscribe", "^"],
      [3, "value", "2.1"],
      [4, "value", "2.2"],
      [4, "complete", "complete"],
    ]);
    expect(last(trace).streams.sink.vals).toEqual(["1.1", "1.2", "2.1", "2.2"]);
  });
});

describe("switchMap_cancels_inner", () => {
  const trace = load("switchMap_cancels_inner");
  const tl = buildTimeline(fromExecutionTrace(trace));

  it("cancels the first inner when the outer delivers again, so the sink never sees 1.2", () => {
    expect(marks(tl, "inner[1]")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "1.1"],
      [2, "unsubscribe", "!"],
    ]);
    expect(last(trace).streams.sink.vals).toEqual(["1.1", "2.1", "2.2"]);
    expect(last(trace).streams.sink.status).toBe("complete");
  });
});

describe("concatMap_stall", () => {
  const trace = load("concatMap_stall");
  const set = fromExecutionTrace(trace);

  it("never subscribes the second inner and never completes the sink", () => {
    expect(set.lanes.map((l) => l.name)).toEqual(["source", "inner", "sink"]);
    const end = last(trace);
    expect(end.streams.source.status).toBe("complete");
    expect(end.streams.inner.vals).toEqual(["1.1"]);
    expect(end.streams.inner.status).toBe("active");
    expect(end.streams.sink).toEqual({ vals: ["1.1"], status: "active" });
    expect(end.internals.active).toEqual(["inner", "sink"]);
  });
});

describe("shareReplay_leak", () => {
  const trace = load("shareReplay_leak");
  const tl = buildTimeline(fromExecutionTrace(trace));

  it("keeps the source delivering after the only subscriber has left", () => {
    expect(marks(tl, "s1")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "0"],
      [2, "unsubscribe", "!"],
    ]);
    expect(marks(tl, "source")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "0"],
      [3, "value", "1"],
      [4, "value", "2"],
      [4, "complete", "complete"],
    ]);
    const set = fromExecutionTrace(trace);
    expect(set.frames[6].internals.active).toEqual(["source"]);
  });
});

describe("share_resets", () => {
  const trace = load("share_resets");
  const tl = buildTimeline(fromExecutionTrace(trace));

  it("unsubscribes the source when the only subscriber leaves", () => {
    expect(marks(tl, "source")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "0"],
      [2, "unsubscribe", "!"],
    ]);
    expect(last(trace).internals.active).toEqual([]);
  });
});

describe("combineLatest_silentB", () => {
  const trace = load("combineLatest_silentB");
  const set = fromExecutionTrace(trace);

  it("completes A while B and the result stay open with nothing delivered", () => {
    expect(set.lanes.map((l) => l.name)).toEqual(["a", "b", "out"]);
    const end = last(trace);
    expect(end.streams.a).toEqual({ vals: [0, 1], status: "complete" });
    expect(end.streams.b).toEqual({ vals: [], status: "active" });
    expect(end.streams.out).toEqual({ vals: [], status: "active" });
    expect(end.internals.active).toEqual(["b", "out"]);
  });
});

describe("renderExecutionTrace over every recording", () => {
  for (const name of NAMES) {
    it(`renders ${name} as one frame per event and a well-formed page`, () => {
      const trace = load(name);
      const { set, frames, html } = renderExecutionTrace(trace, {
        title: name,
      });
      const timelineEvents = trace.events.filter(
        (e) => e.subscriptionId !== undefined && !e.kind.startsWith("session"),
      );
      expect(frames).toHaveLength(timelineEvents.length + 1);
      expect(html).toContain(`<title>${name}</title>`);
      expect(html.match(/<g class="frame"/g)).toHaveLength(set.frames.length);
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("undefined");
    });
  }
});
