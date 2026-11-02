import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  fromTlaTrace,
  renderTrace,
  serialize,
  type TraceFile,
  type Timeline,
} from "../src/index.ts";

/*
 * The four bug demos of rxjs-operator-tla, as checked by tla-ts and
 * committed under traces/. These tests pin what the animation says about
 * each bug, and that the renderer produces a well-formed page for each.
 */

const NAMES = [
  "Flatten_bug_mergeForSwitch",
  "Flatten_stall_concat",
  "Share_leak_demo",
  "CombineLatest_SilentB",
] as const;

const load = (name: string): TraceFile =>
  JSON.parse(
    fs.readFileSync(new URL(`../traces/${name}.json`, import.meta.url), "utf8"),
  ) as TraceFile;

const marks = (tl: Timeline, lane: string): (string | number)[][] =>
  tl.marks.filter((m) => m.lane === lane).map((m) => [m.step, m.label]);

describe("Flatten_bug_mergeForSwitch: mergeMap where switchMap was intended", () => {
  const set = fromTlaTrace(load("Flatten_bug_mergeForSwitch"));
  const tl = buildTimeline(set);

  it("has one lane per inner and the out stream, in the spec's order", () => {
    expect(set.lanes.map((l) => l.name)).toEqual([
      "inner[1]",
      "inner[2]",
      "out",
    ]);
    expect(set.lanes.map((l) => l.kind)).toEqual(["item", "item", "stream"]);
  });

  it("shows inner 1 still active and delivering after inner 2 has delivered", () => {
    expect(marks(tl, "inner[1]")).toEqual([
      [1, "active"],
      [4, "sent=1"],
    ]);
    expect(marks(tl, "inner[2]")).toEqual([
      [2, "active"],
      [3, "sent=1"],
    ]);
    expect(marks(tl, "out")).toEqual([
      [3, "2,1"],
      [4, "1,1"],
    ]);
  });

  it("keeps the outer status and the subscription flag in the panel", () => {
    expect(Object.keys(set.frames[0].internals)).toEqual([
      "outerDone",
      "subscribed",
    ]);
    expect(set.loopStart).toBeNull();
  });
});

describe("Flatten_stall_concat: concatMap behind an inner that never completes", () => {
  const set = fromTlaTrace(load("Flatten_stall_concat"));
  const tl = buildTimeline(set);

  it("shows inner 2 queued and never started while inner 1 has delivered everything", () => {
    expect(marks(tl, "inner[1]")).toEqual([
      [1, "active"],
      [4, "sent=1"],
    ]);
    expect(marks(tl, "inner[2]")).toEqual([[2, "pending"]]);
    expect(marks(tl, "out")).toEqual([[4, "1,1"]]);
    expect(set.frames[4].items["inner[2]"]).toEqual({
      state: "pending",
      sent: 0,
    });
  });

  it("is a liveness counterexample that stays in its last state", () => {
    expect(set.loopStart).toBe(4);
    expect(set.frames[3].internals.outerDone).toBe("complete");
    expect(set.frames[4].streams.out.status).toBe("active");
  });
});

describe("Share_leak_demo: shareReplay keeps the source running after the last subscription leaves", () => {
  const set = fromTlaTrace(load("Share_leak_demo"));
  const tl = buildTimeline(set);

  it("has one lane per subscription plus the source streams, in the spec's order", () => {
    expect(set.lanes.map((l) => l.name)).toEqual([
      "received[s1]",
      "received[s2]",
      "received[s3]",
      "buffer",
      "srcSent",
    ]);
  });

  it("shows s1 subscribing and leaving, with the subject still live in the panel", () => {
    expect(marks(tl, "received[s1]")).toEqual([
      [1, "^"],
      [2, "!"],
    ]);
    expect(set.frames[1].subs["received[s1]"]).toBe("on");
    expect(set.frames[2].subs["received[s1]"]).toBe("off");
    expect(Object.keys(set.frames[2].internals)).toEqual([
      "conn",
      "subject",
      "connections",
    ]);
    expect(set.frames[2].internals.subject).toBe("live");
  });
});

describe("CombineLatest_SilentB: the result never terminates when source B is not fair", () => {
  const set = fromTlaTrace(load("CombineLatest_SilentB"));
  const tl = buildTimeline(set);

  it("has the two sources and the result as streams, and nothing else", () => {
    expect(set.lanes.map((l) => l.name)).toEqual(["a", "b", "out"]);
    expect(Object.keys(set.frames[0].internals)).toEqual([]);
  });

  it("shows A completing while the result stays active forever", () => {
    expect(marks(tl, "a")).toEqual([
      [1, "x"],
      [2, "x"],
      [3, "complete"],
    ]);
    expect(marks(tl, "b")).toEqual([
      [4, "x"],
      [5, "x"],
    ]);
    expect(marks(tl, "out")).toEqual([
      [4, "x,x"],
      [5, "x,x"],
    ]);
    expect(set.frames[3].streams.a.status).toBe("complete");
    expect(set.frames[5].streams.out.status).toBe("active");
    expect(set.loopStart).toBe(5);
  });
});

describe("renderTrace over every fixture", () => {
  for (const name of NAMES) {
    it(`renders ${name} as one frame per state and a well-formed page`, () => {
      const file = load(name);
      const { set, frames, layout, html } = renderTrace(file);
      expect(frames).toHaveLength(file.steps.length);
      expect(frames[0].attrs.visibility).toBe("visible");
      expect(
        frames.slice(1).every((f) => f.attrs.visibility === "hidden"),
      ).toBe(true);
      expect(frames.map((f) => f.attrs.id)).toEqual(
        set.frames.map((f) => `frame-${f.step}`),
      );
      expect(layout.width).toBeGreaterThan(layout.panelX);
      expect(layout.height).toBeGreaterThan(layout.laneY0);

      expect(html).toContain(`<title>${name}</title>`);
      expect(html.match(/<g class="frame"/g)).toHaveLength(frames.length);
      expect(html).toContain(serialize(frames[frames.length - 1]));
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("undefined");
      if (set.loopStart === null)
        expect(html).not.toContain("Liveness violation");
      else
        expect(html).toContain(`loops back to frame ${set.loopStart} forever`);
    });
  }

  it("refuses a trace without states", () => {
    const empty: TraceFile = {
      ...load("Share_leak_demo"),
      steps: [],
      violation: null,
      status: "success",
    };
    expect(() => renderTrace(empty)).toThrow(/no states/);
  });
});
