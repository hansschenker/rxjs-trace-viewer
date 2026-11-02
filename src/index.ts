/*
 * tla-rxjs-svg, the core: frame state, the two adapters, the View and the
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
  CompleteEvent,
  ErrorEvent,
  ExecutionEvent,
  ExecutionTrace,
  JsonPrimitive,
  JsonValue,
  NextEvent,
  SessionEvent,
  SubscribeEvent,
  UnsubscribeEvent,
  UnsubscribeReason,
} from "./execution-trace.ts";

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
export { fromExecutionTrace, fromJson } from "./runtime.ts";

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

export type {
  AnimationPage,
  FragmentOptions,
  GalleryItem,
  GalleryPage,
} from "./animate.ts";
export {
  ANIMATION_CSS,
  ANIMATION_SCRIPT,
  renderAnimationFragment,
  renderAnimationHtml,
  renderGalleryFragment,
  renderGalleryHtml,
} from "./animate.ts";

export type { PageText, RenderOptions, RenderedTrace } from "./render.ts";
export { renderExecutionTrace, renderFrameSet, renderTrace } from "./render.ts";
