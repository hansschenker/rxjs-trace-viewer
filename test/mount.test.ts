// @vitest-environment jsdom
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { toDom } from "../src/dom.ts";
import { fromTlaTrace } from "../src/frames.ts";
import { toFrameSet, traceText } from "../src/input.ts";
import {
  createFrameRenderer,
  mountTraceViewer,
  TRACE_VIEWER_STYLE_ID,
} from "../src/mount.ts";
import { circle, group, text } from "../src/svg.ts";
import type { TraceFile } from "../src/trace-file.ts";
import type { ExecutionTrace } from "../src/execution-trace.ts";

const load = <T>(rel: string): T =>
  JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8")) as T;
const flatten = load<TraceFile>("../traces/Flatten_bug_mergeForSwitch.json");
const recording = load<ExecutionTrace>(
  "../traces/runtime/shareReplay_leak.json",
);

const q = <E extends Element>(root: ParentNode, selector: string): E => {
  const el = root.querySelector<E>(selector);
  if (el === null) throw new Error(`missing ${selector}`);
  return el;
};

describe("toDom", () => {
  it("builds namespaced SVG nodes with attributes and text", () => {
    const el = toDom(
      group([circle(1.234, 2, 3, { fill: "#C2185B" }), text(0, 0, "a & b")], {
        class: "frame",
      }),
      document,
    );
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("class")).toBe("frame");
    expect(q<SVGCircleElement>(el, "circle").getAttribute("cx")).toBe("1.23");
    expect(q<SVGTextElement>(el, "text").textContent).toBe("a & b");
  });
});

describe("createFrameRenderer", () => {
  it("renders any frame on demand with one shared layout", () => {
    const r = createFrameRenderer(fromTlaTrace(flatten));
    expect(r.timeline.lanes).toEqual(["inner[1]", "inner[2]", "out"]);
    expect(r.render(4).attrs.id).toBe("frame-4");
    expect(r.render(0).attrs.id).toBe("frame-0");
    expect(r.layout.width).toBeGreaterThan(0);
  });
});

describe("mountTraceViewer", () => {
  it("mounts the controls, the stage and the step list, and renders the first frame", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountTraceViewer(host, fromTlaTrace(flatten), {
      title: "mergeMap bug",
    });
    const root = handle.element;
    expect(root.classList.contains("rtv")).toBe(true);
    expect(q(root, ".rtv-title").textContent).toBe("mergeMap bug");
    expect(root.querySelectorAll(".rtv-steps button")).toHaveLength(5);
    expect(q(root, ".rtv-counter").textContent).toBe("frame 0 of 4");
    expect(q(root, ".rtv-action").textContent).toBe("Init");
    expect(handle.svg.getAttribute("viewBox")).toBe(
      `0 0 ${handle.renderer.layout.width} ${handle.renderer.layout.height}`,
    );
    expect(handle.svg.querySelectorAll("g.frame")).toHaveLength(1);
    expect(q(handle.svg, "g.frame").getAttribute("id")).toBe("frame-0");
    expect(document.getElementById(TRACE_VIEWER_STYLE_ID)).not.toBeNull();
    handle.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("steps with the buttons, the slider, the step list and the keyboard, rendering one frame at a time", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountTraceViewer(host, fromTlaTrace(flatten));
    const root = handle.element;
    q<HTMLButtonElement>(root, ".rtv-next").click();
    expect(q(root, ".rtv-counter").textContent).toBe("frame 1 of 4");
    expect(q(handle.svg, "g.frame").getAttribute("id")).toBe("frame-1");
    expect(q(root, ".rtv-action").textContent).toBe("OuterNext");

    const slider = q<HTMLInputElement>(root, ".rtv-slider");
    slider.value = "3";
    slider.dispatchEvent(new Event("input"));
    expect(q(handle.svg, "g.frame").getAttribute("id")).toBe("frame-3");

    q<HTMLButtonElement>(root, '.rtv-steps button[data-step="4"]').click();
    expect(handle.player.state.index).toBe(4);
    expect(q(root, ".rtv-steps button.current").textContent).toBe("4InnerNext");

    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(handle.player.state.index).toBe(0);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(handle.player.state.index).toBe(4);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(handle.player.state.index).toBe(3);
    expect(handle.svg.querySelectorAll("g.frame")).toHaveLength(1);
    handle.destroy();
  });

  it("works for a recorded run and can hide the step list", () => {
    const host = document.createElement("div");
    const handle = mountTraceViewer(host, toFrameSet(recording), {
      steps: false,
    });
    expect(host.querySelector(".rtv-steps")).toBeNull();
    expect(handle.renderer.timeline.lanes).toEqual(["source", "s1"]);
    expect(q(host, ".rtv-counter").textContent).toBe("frame 0 of 9");
    handle.destroy();
  });

  it("refuses an empty frame set", () => {
    expect(() =>
      mountTraceViewer(document.createElement("div"), {
        frames: [],
        hasTime: false,
        loopStart: null,
        lanes: [],
      }),
    ).toThrow(/empty/);
  });
});

describe("traceText", () => {
  it("names a trace file, a recording and a frame set, with overrides", () => {
    expect(traceText(flatten)).toEqual({
      title: "Flatten_bug_mergeForSwitch",
      subtitle: "Flatten.tla · invariant-violation · NoInterleaving · 5 frames",
      note: "bug demo: mergeMap where switchMap was intended",
    });
    expect(traceText(recording).title).toBe(recording.title);
    expect(traceText(recording).subtitle).toBe(
      "recorded run · 9 events · 10 frames",
    );
    expect(traceText(fromTlaTrace(flatten), { title: "x" })).toEqual({
      title: "x",
      subtitle: "5 frames",
      note: undefined,
    });
  });
});
