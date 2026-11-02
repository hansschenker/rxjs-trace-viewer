import { describe, expect, it } from "vitest";
import { fromTlaTrace } from "../src/frames.ts";
import type { TraceFile } from "../src/trace.ts";
import { buildTimeline } from "../src/view.ts";

const file = (module: string, steps: TraceFile["steps"], loopStart: number | null = null): TraceFile => ({
  cfg: `${module}.cfg`,
  module,
  status: "invariant-violation",
  violation: { name: "Demo", loopStart },
  steps,
});

/** A trace shaped like Take.tla: take(2) receives a, b and completes. */
const take = file("Take", [
  { index: 0, action: "Init", state: { in: [], inDone: "active", out: [], outDone: "active", subscribed: true } },
  { index: 1, action: "SourceNext", state: { in: ["a"], inDone: "active", out: ["a"], outDone: "active", subscribed: true } },
  { index: 2, action: "SourceNext", state: { in: ["a", "b"], inDone: "active", out: ["a", "b"], outDone: "complete", subscribed: false } },
]);

/** A trace shaped like Share.tla: two subscriptions, two values, one leaves. The buffer slides. */
const share = file("Share", [
  { index: 0, action: "Init", state: { sub: { s1: "idle", s2: "idle" }, received: { s1: [], s2: [] }, subject: "none", buffer: [], srcSent: [] } },
  { index: 1, action: "Subscribe", state: { sub: { s1: "on", s2: "idle" }, received: { s1: [], s2: [] }, subject: "live", buffer: [], srcSent: [] } },
  { index: 2, action: "SourceNext", state: { sub: { s1: "on", s2: "idle" }, received: { s1: ["a"], s2: [] }, subject: "live", buffer: ["a"], srcSent: ["a"] } },
  { index: 3, action: "SourceNext", state: { sub: { s1: "on", s2: "idle" }, received: { s1: ["a", "b"], s2: [] }, subject: "live", buffer: ["b"], srcSent: ["a", "b"] } },
  { index: 4, action: "Unsubscribe", state: { sub: { s1: "off", s2: "idle" }, received: { s1: ["a", "b"], s2: [] }, subject: "live", buffer: ["b"], srcSent: ["a", "b"] } },
]);

/** A trace shaped like Flatten.tla with switchMap: inner 1 is cancelled when inner 2 starts. */
const flatten = file("Flatten", [
  { index: 0, action: "Init", state: { outerDone: "active", inner: [], out: [], outDone: "active", subscribed: true } },
  { index: 1, action: "OuterNext", state: { outerDone: "active", inner: [{ state: "active", sent: 0 }], out: [], outDone: "active", subscribed: true } },
  { index: 2, action: "InnerNext", state: { outerDone: "active", inner: [{ state: "active", sent: 1 }], out: [[1, 1]], outDone: "active", subscribed: true } },
  { index: 3, action: "OuterNext", state: { outerDone: "active", inner: [{ state: "cancelled", sent: 1 }, { state: "active", sent: 0 }], out: [[1, 1]], outDone: "active", subscribed: true } },
]);

describe("fromTlaTrace", () => {
  it("finds append-only sequences as streams and their Done variable as status", () => {
    const set = fromTlaTrace(take);
    expect(set.lanes).toEqual([
      { name: "in", kind: "stream" },
      { name: "out", kind: "stream" },
    ]);
    expect(set.frames).toHaveLength(3);
    expect(set.frames[2].streams.out).toEqual({ vals: ["a", "b"], status: "complete" });
    expect(set.frames[1].streams.out.status).toBe("active");
  });

  it("keeps the other variables as internals", () => {
    const set = fromTlaTrace(take);
    expect(Object.keys(set.frames[0].internals)).toEqual(["subscribed"]);
    expect(set.frames[2].internals.subscribed).toBe(false);
  });

  it("uses the step as the column when the spec has no logical time", () => {
    const set = fromTlaTrace(take);
    expect(set.hasTime).toBe(false);
    expect(set.frames.map((f) => f.column)).toEqual([0, 1, 2]);
  });

  it("makes one stream per subscription, shows its lifecycle on the same lane, and leaves a sliding buffer to the panel", () => {
    const set = fromTlaTrace(share);
    expect(set.lanes.map((l) => l.name)).toEqual(["received[s1]", "received[s2]", "srcSent"]);
    expect(set.frames[1].subs["received[s1]"]).toBe("on");
    expect(set.frames[4].subs["received[s1]"]).toBe("off");
    expect(set.frames[3].streams["received[s1]"].vals).toEqual(["a", "b"]);
    expect(Object.keys(set.frames[0].internals)).toEqual(["subject", "buffer"]);
  });

  it("makes one tracked item per element of a sequence of records", () => {
    const set = fromTlaTrace(flatten);
    expect(set.lanes).toEqual([
      { name: "inner[1]", kind: "item" },
      { name: "inner[2]", kind: "item" },
      { name: "out", kind: "stream" },
    ]);
    expect(set.frames[0].items["inner[1]"]).toBeNull();
    expect(set.frames[3].items["inner[1]"]).toEqual({ state: "cancelled", sent: 1 });
    expect(Object.keys(set.frames[0].internals)).toEqual(["outerDone", "subscribed"]);
  });

  it("orders lanes by the spec's VARIABLES declaration when the trace carries it", () => {
    const set = fromTlaTrace({ ...take, variables: ["out", "outDone", "in", "inDone", "subscribed"] });
    expect(set.lanes.map((l) => l.name)).toEqual(["out", "in"]);
  });

  it("carries the loop start of a liveness counterexample", () => {
    const set = fromTlaTrace(file("Take", take.steps, 1));
    expect(set.loopStart).toBe(1);
  });
});

describe("buildTimeline", () => {
  it("marks each delivery in the step it happened and the completion once", () => {
    const tl = buildTimeline(fromTlaTrace(take));
    const out = tl.marks.filter((m) => m.lane === "out");
    expect(out.map((m) => [m.kind, m.step, m.label])).toEqual([
      ["value", 1, "a"],
      ["value", 2, "b"],
      ["complete", 2, "complete"],
    ]);
    expect(tl.lastColumn).toBe(2);
  });

  it("marks subscribe and unsubscribe on the stream lane", () => {
    const tl = buildTimeline(fromTlaTrace(share));
    const s1 = tl.marks.filter((m) => m.lane === "received[s1]");
    expect(s1.map((m) => [m.kind, m.step])).toEqual([
      ["subscribe", 1],
      ["value", 2],
      ["value", 3],
      ["unsubscribe", 4],
    ]);
  });

  it("marks item changes with the new state or the moved fields", () => {
    const tl = buildTimeline(fromTlaTrace(flatten));
    expect(tl.marks.filter((m) => m.lane === "inner[1]").map((m) => [m.step, m.label])).toEqual([
      [1, "active"],
      [2, "sent=1"],
      [3, "cancelled"],
    ]);
    expect(tl.marks.filter((m) => m.lane === "inner[2]").map((m) => [m.step, m.label])).toEqual([[3, "active"]]);
    expect(tl.marks.filter((m) => m.lane === "out").map((m) => [m.step, m.label])).toEqual([[2, "1,1"]]);
  });
});
