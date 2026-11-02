import { renderAnimationHtml } from "./animate.ts";
import { fromTlaTrace, type FrameSet } from "./frames.ts";
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
 * The whole pipeline after the checker: TraceFile -> frames -> SVG -> page.
 */

export interface RenderOptions {
  /** Page title; defaults to the config name without `.cfg`. */
  readonly title?: string;
}

export interface RenderedTrace {
  readonly set: FrameSet;
  readonly timeline: Timeline;
  readonly layout: Layout;
  /** One `<g class="frame">` per state, in order. */
  readonly frames: readonly SvgElem[];
  /** The self-contained playback page. */
  readonly html: string;
}

export function renderTrace(
  file: TraceFile,
  options: RenderOptions = {},
): RenderedTrace {
  if (file.steps.length === 0) {
    throw new Error(
      `${file.cfg}: ${file.status}, the trace has no states to animate`,
    );
  }
  const set = fromTlaTrace(file);
  const timeline = buildTimeline(set);
  const layout = layoutFor(set, timeline);
  const frames = set.frames.map((_, i) =>
    renderFrame(set, timeline, layout, i),
  );
  const title = options.title ?? file.cfg.replace(/\.cfg$/, "");
  const violation = file.violation === null ? "" : ` · ${file.violation.name}`;
  const html = renderAnimationHtml({
    title,
    subtitle: `${file.module}.tla · ${file.status}${violation} · ${set.frames.length} frames`,
    note: file.note,
    width: layout.width,
    height: layout.height,
    frames,
    steps: set.frames.map((f) => f.action),
    loopStart: set.loopStart,
  });
  return { set, timeline, layout, frames, html };
}
