import { mountSvg } from "./dom.ts";
import type { FrameSet } from "./frames.ts";
import { createPlayer, type Player, type PlayerOptions } from "./player.ts";
import type { SvgElem } from "./svg.ts";
import {
  buildTimeline,
  layoutFor,
  renderFrame,
  type Layout,
  type Timeline,
} from "./view.ts";

/*
 * The viewer as a DOM component: the controls of the playback page, with
 * the current frame rendered on demand into one <svg> instead of every
 * frame pre-rendered as a hidden group. Framework-less, so the JSX and Vue
 * components are thin wrappers around mountTraceViewer.
 */

export interface FrameRenderer {
  readonly set: FrameSet;
  readonly timeline: Timeline;
  readonly layout: Layout;
  render(index: number): SvgElem;
}

/** Computes the timeline and layout once; frames are rendered as asked for. */
export function createFrameRenderer(set: FrameSet): FrameRenderer {
  const timeline = buildTimeline(set);
  const layout = layoutFor(set, timeline);
  return {
    set,
    timeline,
    layout,
    render: (index) => renderFrame(set, timeline, layout, index),
  };
}

export interface MountOptions extends PlayerOptions {
  readonly title?: string;
  readonly subtitle?: string;
  readonly note?: string;
  /** Show the clickable list of steps next to the stage. Default true. */
  readonly steps?: boolean;
  /** Arrow keys, Home, End and Space while the viewer has focus. Default true. */
  readonly keyboard?: boolean;
}

export interface TraceViewerHandle {
  readonly element: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly player: Player;
  readonly renderer: FrameRenderer;
  destroy(): void;
}

const MONO =
  'var(--rxjs-font-mono, "JetBrains Mono", Consolas, Menlo, monospace)';

/**
 * Styles for the mounted viewer. Colours come from `--rtv-*` tokens, which
 * default to the rxjs-ds tokens and then to the design note's palette, so a
 * host can remap them (a dark theme, for instance) without touching the
 * component.
 */
export const TRACE_VIEWER_CSS = `
.rtv { --rtv-ink: var(--rxjs-color-text, #231A1E); --rtv-muted: var(--rxjs-color-text-secondary, #6E5E66); --rtv-rule: var(--rxjs-color-border, #E6DADF); --rtv-accent: var(--rxjs-pink-700, #C2185B); --rtv-surface: var(--rxjs-color-surface, #FFFFFF); --rtv-on-accent: #FFFFFF;
  color: var(--rtv-ink); font-family: var(--rxjs-font-sans, system-ui, "Segoe UI", Helvetica, Arial, sans-serif); font-size: 15px; line-height: 1.5; outline: none; }
.rtv:focus-visible { box-shadow: 0 0 0 2px var(--rtv-accent); border-radius: 4px; }
.rtv-title { font-family: ${MONO}; font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.rtv-sub, .rtv-note, .rtv-loop { margin: 0 0 6px; color: var(--rtv-muted); font-size: 14px; }
.rtv-loop { color: var(--rtv-accent); }
.rtv-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 12px 0 10px; }
.rtv button { font: inherit; font-size: 14px; color: var(--rtv-ink); background: var(--rtv-surface); border: 1px solid var(--rtv-rule); border-radius: 4px; padding: 5px 11px; cursor: pointer; }
.rtv button:hover { border-color: var(--rtv-accent); }
.rtv button:focus-visible { outline: 2px solid var(--rtv-accent); outline-offset: 2px; }
.rtv-slider { width: min(320px, 100%); accent-color: var(--rtv-accent); }
.rtv-counter { font-family: ${MONO}; font-size: 13px; min-width: 12ch; }
.rtv-action { font-family: ${MONO}; font-size: 14px; font-weight: 600; color: var(--rtv-accent); }
.rtv-help { color: var(--rtv-muted); font-size: 12.5px; }
.rtv kbd { font-family: inherit; border: 1px solid var(--rtv-rule); border-radius: 3px; padding: 0 4px; font-size: 11.5px; }
.rtv-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
.rtv-layout--no-steps { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 820px) { .rtv-layout { grid-template-columns: 1fr; } }
.rtv-stage-wrap { border: 1px solid var(--rtv-rule); background: var(--rtv-surface); padding: 8px; overflow-x: auto; }
.rtv-stage { display: block; width: 100%; height: auto; max-width: 100%; color: var(--rtv-ink); }
.rtv-steps { margin: 0; padding: 0; list-style: none; max-height: 60vh; overflow-y: auto; border: 1px solid var(--rtv-rule); background: var(--rtv-surface); }
.rtv-steps li { border-bottom: 1px solid var(--rtv-rule); }
.rtv-steps button { display: flex; gap: 10px; width: 100%; text-align: left; border: 0; border-radius: 0; background: none; padding: 5px 10px; font-family: ${MONO}; font-size: 12.5px; }
.rtv-steps button .n { color: var(--rtv-muted); min-width: 2.5ch; text-align: right; }
.rtv-steps button.current { background: var(--rtv-accent); color: var(--rtv-on-accent); }
.rtv-steps button.current .n { color: var(--rtv-on-accent); opacity: 0.85; }
`;

export const TRACE_VIEWER_STYLE_ID = "rtv-styles";

/** Adds the viewer styles to the document once. */
export function ensureTraceViewerStyles(doc: Document): void {
  if (doc.getElementById(TRACE_VIEWER_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TRACE_VIEWER_STYLE_ID;
  style.textContent = TRACE_VIEWER_CSS;
  doc.head.append(style);
}

export function mountTraceViewer(
  container: HTMLElement,
  set: FrameSet,
  options: MountOptions = {},
): TraceViewerHandle {
  if (set.frames.length === 0)
    throw new Error("nothing to show: the frame set is empty");
  const doc = container.ownerDocument;
  ensureTraceViewerStyles(doc);
  const renderer = createFrameRenderer(set);
  const player = createPlayer(set.frames.length, options);
  const showSteps = options.steps ?? true;
  const last = set.frames.length - 1;

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

  const root = h("div", "rtv");
  root.tabIndex = 0;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", options.title ?? "trace viewer");

  if (options.title !== undefined)
    root.append(h("h2", "rtv-title", options.title));
  if (options.subtitle !== undefined)
    root.append(h("p", "rtv-sub", options.subtitle));
  if (options.note !== undefined) root.append(h("p", "rtv-note", options.note));
  if (set.loopStart !== null) {
    root.append(
      h(
        "p",
        "rtv-loop",
        `Liveness violation: after the last frame the trace loops back to frame ${set.loopStart} forever.`,
      ),
    );
  }

  const controls = h("div", "rtv-controls");
  const prev = h("button", "rtv-prev", "Prev");
  const next = h("button", "rtv-next", "Next");
  const play = h("button", "rtv-play", "Play");
  for (const b of [prev, next, play]) b.type = "button";
  const slider = h("input", "rtv-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(last);
  slider.value = "0";
  slider.setAttribute("aria-label", "frame");
  const counter = h("span", "rtv-counter");
  const action = h("span", "rtv-action");
  const help = h("span", "rtv-help");
  help.append(
    "step ",
    kbd(doc, "←"),
    " ",
    kbd(doc, "→"),
    " · ",
    kbd(doc, "Home"),
    " ",
    kbd(doc, "End"),
    " · play ",
    kbd(doc, "Space"),
  );
  controls.append(prev, next, play, slider, counter, action, help);
  root.append(controls);

  const layout = h(
    "div",
    showSteps ? "rtv-layout" : "rtv-layout rtv-layout--no-steps",
  );
  const stageWrap = h("div", "rtv-stage-wrap");
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "rtv-stage");
  svg.setAttribute(
    "viewBox",
    `0 0 ${renderer.layout.width} ${renderer.layout.height}`,
  );
  stageWrap.append(svg);
  layout.append(stageWrap);

  const stepButtons: HTMLButtonElement[] = [];
  if (showSteps) {
    const list = h("ol", "rtv-steps");
    set.frames.forEach((frame, i) => {
      const li = doc.createElement("li");
      const b = h("button", "");
      b.type = "button";
      b.dataset.step = String(i);
      const n = h("span", "n", String(i));
      b.append(n, frame.action);
      b.addEventListener("click", () => player.goTo(i));
      li.append(b);
      list.append(li);
      stepButtons.push(b);
    });
    layout.append(list);
  }
  root.append(layout);

  const render = (): void => {
    const { index, playing } = player.state;
    mountSvg(svg, renderer.render(index));
    slider.value = String(index);
    counter.textContent = `frame ${index} of ${last}`;
    action.textContent = set.frames[index].action;
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

  const onKey = (e: KeyboardEvent): void => {
    if (e.target === slider) return;
    if (e.key === "ArrowRight") player.next();
    else if (e.key === "ArrowLeft") player.prev();
    else if (e.key === "Home") player.first();
    else if (e.key === "End") player.last();
    else if (e.key === " ") player.toggle();
    else return;
    e.preventDefault();
  };
  if (options.keyboard ?? true) root.addEventListener("keydown", onKey);

  const unsubscribe = player.subscribe(render);
  render();
  container.append(root);

  return {
    element: root,
    svg,
    player,
    renderer,
    destroy() {
      unsubscribe();
      player.destroy();
      root.remove();
    },
  };
}

function kbd(doc: Document, key: string): HTMLElement {
  const el = doc.createElement("kbd");
  el.textContent = key;
  return el;
}
