import { renderAnimationHtml, type AnimationPage } from "./animate.ts";
import type { ExecutionTrace } from "./execution-trace.ts";
import { fromTlaTrace, type FrameSet } from "./frames.ts";
import { fromExecutionTrace } from "./runtime.ts";
import type { SvgElem } from "./svg.ts";
import type { TraceFile } from "./trace-file.ts";
import {
  buildTimeline,
  layoutFor,
  renderFrame,
  type Layout,
  type Timeline,
} from "./view.ts";

/*
 * The whole pipeline after the adapter: FrameSet -> frames -> SVG -> page,
 * with one entry per trace kind.
 */

export interface RenderOptions {
  /** Page title; defaults to the trace's own name. */
  readonly title?: string;
}

export interface RenderedTrace {
  readonly set: FrameSet;
  readonly timeline: Timeline;
  readonly layout: Layout;
  /** One `<g class="frame">` per state, in order. */
  readonly frames: readonly SvgElem[];
  /** Everything a page or gallery needs to show the animation. */
  readonly page: AnimationPage;
  /** The self-contained playback page. */
  readonly html: string;
}

export interface PageText {
  readonly title: string;
  readonly subtitle: string;
  readonly note: string | undefined;
}

export function renderFrameSet(set: FrameSet, text: PageText): RenderedTrace {
  if (set.frames.length === 0) {
    throw new Error(`${text.title}: the trace has no states to animate`);
  }
  const timeline = buildTimeline(set);
  const layout = layoutFor(set, timeline);
  const frames = set.frames.map((_, i) =>
    renderFrame(set, timeline, layout, i),
  );
  const page: AnimationPage = {
    ...text,
    width: layout.width,
    height: layout.height,
    frames,
    steps: set.frames.map((f) => f.action),
    loopStart: set.loopStart,
  };
  return {
    set,
    timeline,
    layout,
    frames,
    page,
    html: renderAnimationHtml(page),
  };
}

/** A tla-ts counterexample, as `traces/<cfg>.json`. */
export function renderTrace(
  file: TraceFile,
  options: RenderOptions = {},
): RenderedTrace {
  const title = options.title ?? file.cfg.replace(/\.cfg$/, "");
  const violation = file.violation === null ? "" : ` · ${file.violation.name}`;
  const subtitle = `${file.module}.tla · ${file.status}${violation} · ${file.steps.length} frames`;
  return renderFrameSet(fromTlaTrace(file), {
    title,
    subtitle,
    note: file.note,
  });
}

/** A recorded run, as rxjs-execution-debugger exports it. */
export function renderExecutionTrace(
  trace: ExecutionTrace,
  options: RenderOptions = {},
): RenderedTrace {
  const title = options.title ?? trace.title ?? trace.sessionId;
  const set = fromExecutionTrace(trace);
  const subtitle = `recorded run · ${trace.events.length} events · ${set.frames.length} frames`;
  return renderFrameSet(set, { title, subtitle, note: trace.note });
}
