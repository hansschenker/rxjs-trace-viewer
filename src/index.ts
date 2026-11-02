/*
 * tla-rxjs-svg, the core: frame state, the model adapter, the View and the
 * playback page. No dependency on Node or tla-ts, so it can run in a
 * browser. Checking a spec lives in the `tla-rxjs-svg/tla` entry.
 */

export type { JsRecord, JsValue } from "./values.ts";
export { isJsArray, isJsRecord } from "./values.ts";

export type {
  ManifestEntry,
  TraceFile,
  TraceStepJs,
  TraceViolation,
} from "./trace-file.ts";

export type {
  FrameSet,
  FrameState,
  Lane,
  LaneKind,
  Status,
  StreamState,
  SubState,
} from "./frames.ts";
export { fromTlaTrace } from "./frames.ts";

export type { Layout, Mark, MarkKind, Timeline } from "./view.ts";
export {
  ACCENT,
  ERROR,
  MODEL,
  buildTimeline,
  formatTla,
  layoutFor,
  renderFrame,
  shortLabel,
} from "./view.ts";

export type { Attrs, SvgChild, SvgElem } from "./svg.ts";
export {
  circle,
  el,
  escapeAttr,
  escapeText,
  group,
  line,
  rect,
  serialize,
  text,
  title,
} from "./svg.ts";

export type { AnimationPage } from "./animate.ts";
export { renderAnimationHtml } from "./animate.ts";

export type { RenderOptions, RenderedTrace } from "./render.ts";
export { renderTrace } from "./render.ts";
