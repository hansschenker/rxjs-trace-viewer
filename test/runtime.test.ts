import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  fromExecutionTrace,
  fromJson,
  renderExecutionTrace,
  type ExecutionEvent,
  type ExecutionTrace,
} from "../src/index.ts";

/*
 * A recording shaped like `source$.pipe(trace("source"), switchMap(traceProjection("inner", ...)), trace("sink"))`
 * as rxjs-execution-debugger records it: the sink subscribes first, inner
 * subscriptions carry their parent, synchronous events share a time.
 */
let seq = 0;
const ev = (
  at: number,
  kind: ExecutionEvent["kind"],
  label: string,
  sub: string,
  extra: Record<string, unknown> = {},
): ExecutionEvent =>
  ({
    sequence: ++seq,
    at,
    observableId: `obs-${label}`,
    label,
    subscriptionId: sub,
    kind,
    ...extra,
  }) as ExecutionEvent;

seq = 0;
const events: ExecutionEvent[] = [
  ev(0, "subscribe", "sink", "sub-1"),
  ev(0, "subscribe", "source", "sub-2"),
  ev(10, "next", "source", "sub-2", { value: 0 }),
  ev(10, "subscribe", "inner", "sub-3", { parentSubscriptionId: "sub-2" }),
  ev(20, "next", "inner", "sub-3", {
    value: "1.1",
    parentSubscriptionId: "sub-2",
  }),
  ev(20, "next", "sink", "sub-1", { value: "1.1" }),
  ev(30, "next", "source", "sub-2", { value: 1 }),
  ev(30, "unsubscribe", "inner", "sub-3", {
    reason: "cancel",
    parentSubscriptionId: "sub-2",
  }),
  ev(30, "subscribe", "inner", "sub-4", { parentSubscriptionId: "sub-2" }),
  ev(30, "complete", "source", "sub-2"),
  ev(30, "unsubscribe", "source", "sub-2", { reason: "complete" }),
  ev(40, "next", "inner", "sub-4", {
    value: null,
    parentSubscriptionId: "sub-2",
  }),
  ev(40, "next", "sink", "sub-1", { value: null }),
  ev(40, "complete", "inner", "sub-4", { parentSubscriptionId: "sub-2" }),
  ev(40, "unsubscribe", "inner", "sub-4", {
    reason: "complete",
    parentSubscriptionId: "sub-2",
  }),
  ev(40, "complete", "sink", "sub-1"),
  ev(40, "unsubscribe", "sink", "sub-1", { reason: "complete" }),
];
const trace: ExecutionTrace = { schemaVersion: 1, sessionId: "demo", events };

describe("fromExecutionTrace", () => {
  it("makes one lane per subscription, numbering repeated labels, children after their parent", () => {
    const set = fromExecutionTrace(trace);
    expect(set.lanes.map((l) => l.name)).toEqual([
      "sink",
      "source",
      "inner[1]",
      "inner[2]",
    ]);
    expect(set.lanes.every((l) => l.kind === "stream")).toBe(true);
  });

  it("orders lanes by the recording's labels when it has them", () => {
    const set = fromExecutionTrace({
      ...trace,
      labels: ["source", "inner", "sink"],
    });
    expect(set.lanes.map((l) => l.name)).toEqual([
      "source",
      "inner[1]",
      "inner[2]",
      "sink",
    ]);
  });

  it("has an initial frame and then one frame per event, in columns of distinct times", () => {
    const set = fromExecutionTrace(trace);
    expect(set.frames).toHaveLength(events.length + 1);
    expect(set.frames[0].action).toBe("Init");
    expect(set.frames.map((f) => f.column)).toEqual([
      0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4,
    ]);
    expect(set.hasTime).toBe(true);
    expect(set.columnLabels).toEqual(["0ms", "10ms", "20ms", "30ms", "40ms"]);
    expect(set.axisLabel).toBe("time");
  });

  it("folds values, status and lifecycle into each frame", () => {
    const set = fromExecutionTrace(trace);
    const at = (i: number) => set.frames[i];
    expect(at(0).subs.source).toBe("idle");
    expect(at(2).subs.source).toBe("on");
    expect(at(3).streams.source.vals).toEqual([0]);
    expect(at(8).subs["inner[1]"]).toBe("off");
    expect(at(8).streams["inner[1]"].status).toBe("active");
    expect(at(10).streams.source.status).toBe("complete");
    expect(at(11).subs.source).toBe("complete");
    expect(at(12).streams["inner[2]"].vals).toEqual(["null"]);
    expect(at(17).streams.sink).toEqual({
      vals: ["1.1", "null"],
      status: "complete",
    });
    expect(at(17).internals.active).toEqual([]);
    expect(at(7).internals.active).toEqual(["sink", "source", "inner[1]"]);
  });

  it("describes each event as the frame's action", () => {
    const set = fromExecutionTrace(trace);
    expect(set.frames.slice(1, 9).map((f) => f.action)).toEqual([
      "sink: subscribe",
      "source: subscribe",
      "source: next 0",
      "inner[1]: subscribe",
      "inner[1]: next 1.1",
      "sink: next 1.1",
      "source: next 1",
      "inner[1]: unsubscribe (cancel)",
    ]);
  });

  it("produces the same marks the View draws for the model side", () => {
    const tl = buildTimeline(
      fromExecutionTrace({ ...trace, labels: ["source", "inner", "sink"] }),
    );
    const marks = (lane: string) =>
      tl.marks
        .filter((m) => m.lane === lane)
        .map((m) => [m.column, m.kind, m.label]);
    expect(marks("source")).toEqual([
      [0, "subscribe", "^"],
      [1, "value", "0"],
      [3, "value", "1"],
      [3, "complete", "complete"],
    ]);
    expect(marks("inner[1]")).toEqual([
      [1, "subscribe", "^"],
      [2, "value", "1.1"],
      [3, "unsubscribe", "!"],
    ]);
    expect(marks("inner[2]")).toEqual([
      [3, "subscribe", "^"],
      [4, "value", "null"],
      [4, "complete", "complete"],
    ]);
  });

  it("ignores session events and tolerates events out of order", () => {
    const shuffled: ExecutionTrace = {
      ...trace,
      events: [
        {
          sequence: 0,
          at: 0,
          observableId: "session",
          kind: "session-started",
        },
        ...[...events].reverse(),
        {
          sequence: 99,
          at: 40,
          observableId: "session",
          kind: "session-ended",
        },
      ],
    };
    expect(fromExecutionTrace(shuffled).frames).toHaveLength(events.length + 1);
  });

  it("renders a page like the model side does", () => {
    const { set, html, page } = renderExecutionTrace(trace, { title: "demo" });
    expect(page.title).toBe("demo");
    expect(html).toContain("<title>demo</title>");
    expect(html.match(/<g class="frame"/g)).toHaveLength(set.frames.length);
    expect(html).toContain("40ms");
  });
});

describe("fromJson", () => {
  it("maps null to the string null and keeps everything else", () => {
    expect(fromJson(null)).toBe("null");
    expect(fromJson([1, null, { a: null }])).toEqual([
      1,
      "null",
      { a: "null" },
    ]);
    expect(fromJson({ type: "undefined" })).toEqual({ type: "undefined" });
  });
});
