import { mountSvg } from "./dom.ts";
import type { FrameSet, SubState } from "./frames.ts";
import {
  createFrameRenderer,
  ensureTraceViewerStyles,
  type FrameRenderer,
} from "./mount.ts";
import { createPlayer, type Player, type PlayerOptions } from "./player.ts";

/*
 * Model beside runtime: a spec counterexample and a recorded run of the
 * same scenario, stepped by one player. The runtime has the finer frames
 * (one per event), so the player runs over it and each runtime frame is
 * aligned to a model frame by progress on the result lane: the last model
 * state that has delivered no more result values, and reached no later
 * lifecycle stage, than the runtime has at that frame.
 */

export interface AlignOptions {
  /** The model's result lane; default `out`, else the last stream lane. */
  readonly modelLane?: string;
  /** The runtime's result lane; default `sink`, else the last stream lane. */
  readonly runtimeLane?: string;
}

/** The lane whose progress stands for the scenario's result. */
export function outputLane(set: FrameSet, preferred?: string): string | null {
  const names = set.lanes.filter((l) => l.kind === "stream").map((l) => l.name);
  if (preferred !== undefined && names.includes(preferred)) return preferred;
  for (const name of ["out", "sink"]) if (names.includes(name)) return name;
  return names.length > 0 ? names[names.length - 1] : null;
}

const STAGE: Readonly<Record<SubState, number>> = {
  idle: 0,
  on: 0.5,
  off: 1,
  complete: 1,
  error: 1,
};

/** Values delivered, weighted above the lifecycle stage, so order is total. */
function progress(set: FrameSet, lane: string, index: number): number {
  const frame = set.frames[index];
  const stream = frame.streams[lane];
  if (stream === undefined) return 0;
  const sub = frame.subs[lane];
  const stage =
    sub !== undefined ? STAGE[sub] : stream.status === "active" ? 0 : 1;
  return stream.vals.length * 2 + stage;
}

/** For each runtime frame, the model frame to show beside it. */
export function alignByOutput(
  model: FrameSet,
  runtime: FrameSet,
  options: AlignOptions = {},
): number[] {
  const modelLane = outputLane(model, options.modelLane);
  const runtimeLane = outputLane(runtime, options.runtimeLane);
  const lastModel = model.frames.length - 1;
  if (modelLane === null || runtimeLane === null) {
    return runtime.frames.map((_, i) => Math.min(i, lastModel));
  }
  const modelProgress = model.frames.map((_, j) =>
    progress(model, modelLane, j),
  );
  return runtime.frames.map((_, i) => {
    const k = progress(runtime, runtimeLane, i);
    let best = 0;
    modelProgress.forEach((p, j) => {
      if (p <= k) best = j;
    });
    return best;
  });
}

export interface PairOptions extends PlayerOptions, AlignOptions {
  readonly title?: string;
  readonly note?: string;
  readonly modelTitle?: string;
  readonly runtimeTitle?: string;
  /** Show the clickable list of runtime steps. Default true. */
  readonly steps?: boolean;
  readonly keyboard?: boolean;
}

export interface PairedViewerHandle {
  readonly element: HTMLElement;
  readonly player: Player;
  readonly model: FrameRenderer;
  readonly runtime: FrameRenderer;
  readonly alignment: readonly number[];
  destroy(): void;
}

export const PAIR_CSS = `
.rtv-pair-stages { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
@media (max-width: 900px) { .rtv-pair-stages { grid-template-columns: 1fr; } }
.rtv-pane-title { font-family: var(--rxjs-font-mono, "JetBrains Mono", Consolas, Menlo, monospace); font-size: 12.5px; font-weight: 600; color: var(--rtv-muted); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.06em; }
.rtv-pane-action { font-family: var(--rxjs-font-mono, "JetBrains Mono", Consolas, Menlo, monospace); font-size: 12.5px; margin: 6px 0 0; }
.rtv-pane-action b { color: var(--rtv-accent); }
`;

export const PAIR_STYLE_ID = "rtv-pair-styles";

export function mountPairedViewer(
  container: HTMLElement,
  modelSet: FrameSet,
  runtimeSet: FrameSet,
  options: PairOptions = {},
): PairedViewerHandle {
  if (modelSet.frames.length === 0 || runtimeSet.frames.length === 0) {
    throw new Error("nothing to show: a frame set is empty");
  }
  const doc = container.ownerDocument;
  ensureTraceViewerStyles(doc);
  if (doc.getElementById(PAIR_STYLE_ID) === null) {
    const style = doc.createElement("style");
    style.id = PAIR_STYLE_ID;
    style.textContent = PAIR_CSS;
    doc.head.append(style);
  }
  const model = createFrameRenderer(modelSet);
  const runtime = createFrameRenderer(runtimeSet);
  const alignment = alignByOutput(modelSet, runtimeSet, options);
  const player = createPlayer(runtimeSet.frames.length, options);
  const last = runtimeSet.frames.length - 1;

  const h = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const pane = (
    title: string,
    renderer: FrameRenderer,
  ): { el: HTMLElement; svg: SVGSVGElement; action: HTMLElement } => {
    const el = h("div", "rtv-pane");
    el.append(h("p", "rtv-pane-title", title));
    const wrap = h("div", "rtv-stage-wrap");
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "rtv-stage");
    svg.setAttribute(
      "viewBox",
      `0 0 ${renderer.layout.width} ${renderer.layout.height}`,
    );
    wrap.append(svg);
    const action = h("p", "rtv-pane-action");
    el.append(wrap, action);
    return { el, svg, action };
  };

  const root = h("div", "rtv rtv-pair");
  root.tabIndex = 0;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", options.title ?? "model beside runtime");
  if (options.title !== undefined)
    root.append(h("h2", "rtv-title", options.title));
  if (options.note !== undefined) root.append(h("p", "rtv-note", options.note));
  root.append(
    h(
      "p",
      "rtv-sub",
      "The runtime is stepped one event at a time; the model shows the last state that has delivered no more results than the runtime has.",
    ),
  );

  const controls = h("div", "rtv-controls");
  const prev = h("button", "rtv-prev", "Prev");
  const next = h("button", "rtv-next", "Next");
  const play = h("button", "rtv-play", "Play");
  for (const b of [prev, next, play]) b.type = "button";
  const slider = h("input", "rtv-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(last);
  slider.setAttribute("aria-label", "frame");
  const counter = h("span", "rtv-counter");
  controls.append(prev, next, play, slider, counter);
  root.append(controls);

  const stages = h("div", "rtv-pair-stages");
  const left = pane(options.modelTitle ?? "model: spec counterexample", model);
  const right = pane(options.runtimeTitle ?? "runtime: recorded run", runtime);
  stages.append(left.el, right.el);
  const layout = h(
    "div",
    (options.steps ?? true) ? "rtv-layout" : "rtv-layout rtv-layout--no-steps",
  );
  layout.append(stages);

  const stepButtons: HTMLButtonElement[] = [];
  if (options.steps ?? true) {
    const list = h("ol", "rtv-steps");
    runtimeSet.frames.forEach((frame, i) => {
      const li = doc.createElement("li");
      const b = h("button", "");
      b.type = "button";
      b.dataset.step = String(i);
      b.append(h("span", "n", String(i)), frame.action);
      b.addEventListener("click", () => player.goTo(i));
      li.append(b);
      list.append(li);
      stepButtons.push(b);
    });
    layout.append(list);
  }
  root.append(layout);

  const actionLine = (
    el: HTMLElement,
    label: string,
    index: number,
    action: string,
  ): void => {
    el.replaceChildren(`${label} ${index} · `);
    const b = doc.createElement("b");
    b.textContent = action;
    el.append(b);
  };
  const render = (): void => {
    const { index, playing } = player.state;
    const m = alignment[index];
    mountSvg(left.svg, model.render(m));
    mountSvg(right.svg, runtime.render(index));
    actionLine(left.action, "model frame", m, modelSet.frames[m].action);
    actionLine(
      right.action,
      "runtime frame",
      index,
      runtimeSet.frames[index].action,
    );
    slider.value = String(index);
    counter.textContent = `frame ${index} of ${last}`;
    play.textContent = playing ? "Pause" : "Play";
    stepButtons.forEach((b, i) => {
      b.classList.toggle("current", i === index);
      if (i === index) b.scrollIntoView?.({ block: "nearest" });
    });
  };

  prev.addEventListener("click", () => player.prev());
  next.addEventListener("click", () => player.next());
  play.addEventListener("click", () => player.toggle());
  slider.addEventListener("input", () => player.goTo(Number(slider.value)));
  if (options.keyboard ?? true) {
    root.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.target === slider) return;
      if (e.key === "ArrowRight") player.next();
      else if (e.key === "ArrowLeft") player.prev();
      else if (e.key === "Home") player.first();
      else if (e.key === "End") player.last();
      else if (e.key === " ") player.toggle();
      else return;
      e.preventDefault();
    });
  }

  const unsubscribe = player.subscribe(render);
  render();
  container.append(root);
  return {
    element: root,
    player,
    model,
    runtime,
    alignment,
    destroy() {
      unsubscribe();
      player.destroy();
      root.remove();
    },
  };
}
