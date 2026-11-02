// @vitest-environment jsdom
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExecutionTrace } from "../src/execution-trace.ts";
import { fromTlaTrace } from "../src/frames.ts";
import { alignByOutput, mountPairedViewer, outputLane } from "../src/pair.ts";
import { fromExecutionTrace } from "../src/runtime.ts";
import type { TraceFile } from "../src/trace-file.ts";

const load = <T>(rel: string): T =>
  JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8")) as T;
const pairs = load<
  {
    id: string;
    model: string;
    runtime: string;
    modelLane?: string;
    runtimeLane?: string;
  }[]
>("../traces/pairs.json");
const sets = (id: string) => {
  const pair = pairs.find((p) => p.id === id);
  if (pair === undefined) throw new Error(id);
  return {
    pair,
    model: fromTlaTrace(load<TraceFile>(`../traces/${pair.model}.json`)),
    runtime: fromExecutionTrace(
      load<ExecutionTrace>(`../traces/runtime/${pair.runtime}.json`),
    ),
  };
};

const q = (root: ParentNode, selector: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(selector);
  if (el === null) throw new Error(`missing ${selector}`);
  return el;
};

describe("outputLane", () => {
  it("prefers the named lane, then out or sink, then the last stream lane", () => {
    const { model, runtime } = sets("mergeMap");
    expect(outputLane(model)).toBe("out");
    expect(outputLane(runtime)).toBe("sink");
    expect(outputLane(model, "inner[1]")).toBe("out");
    const share = sets("shareReplay");
    expect(outputLane(share.model)).toBe("srcSent");
    expect(outputLane(share.model, "received[s1]")).toBe("received[s1]");
    expect(outputLane(share.runtime)).toBe("s1");
  });
});

describe("alignByOutput", () => {
  it("maps each runtime frame of the mergeMap pair to the model frame with the same result progress", () => {
    const { model, runtime } = sets("mergeMap");
    const a = alignByOutput(model, runtime);
    expect(a).toHaveLength(runtime.frames.length);
    expect(a.slice(0, 6)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(a[6]).toBe(3);
    expect(a[11]).toBe(3);
    expect(a[12]).toBe(4);
    expect(a[a.length - 1]).toBe(4);
    expect(a.every((m, i) => i === 0 || m >= a[i - 1])).toBe(true);
  });

  it("aligns the share pair by the subscriber's lifecycle, with the lanes from pairs.json", () => {
    const { pair, model, runtime } = sets("shareReplay");
    const a = alignByOutput(model, runtime, pair);
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(1);
    expect(a[a.length - 1]).toBe(2);
    expect(a.every((m, i) => i === 0 || m >= a[i - 1])).toBe(true);
  });

  it("never runs ahead of the model's last frame", () => {
    for (const { id } of pairs) {
      const { pair, model, runtime } = sets(id);
      const a = alignByOutput(model, runtime, pair);
      expect(Math.max(...a)).toBeLessThanOrEqual(model.frames.length - 1);
      expect(a).toHaveLength(runtime.frames.length);
    }
  });
});

describe("mountPairedViewer", () => {
  it("steps both stages from one player, the model through the alignment", () => {
    const { model, runtime } = sets("mergeMap");
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountPairedViewer(host, model, runtime, {
      title: "mergeMap",
    });
    const root = handle.element;
    expect(root.querySelectorAll("svg.rtv-stage")).toHaveLength(2);
    expect(root.querySelectorAll(".rtv-steps button")).toHaveLength(
      runtime.frames.length,
    );
    expect(q(root, ".rtv-counter").textContent).toBe("frame 0 of 22");
    const panes = root.querySelectorAll<SVGSVGElement>("svg.rtv-stage");
    expect(q(panes[0], "g.frame").getAttribute("id")).toBe("frame-2");
    expect(q(panes[1], "g.frame").getAttribute("id")).toBe("frame-0");

    q(root, '.rtv-steps button[data-step="12"]').click();
    expect(q(panes[0], "g.frame").getAttribute("id")).toBe("frame-4");
    expect(q(panes[1], "g.frame").getAttribute("id")).toBe("frame-12");
    expect(q(root, ".rtv-pane-action b").textContent).toBe("InnerNext");

    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(handle.player.state.index).toBe(0);
    handle.destroy();
    expect(host.children).toHaveLength(0);
  });
});
