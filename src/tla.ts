/*
 * rxjs-trace-viewer/tla: the checking half. Runs tla-ts on a config and converts
 * its values. Needs Node and tla-ts.
 */

export { toJs } from "./tla-values.ts";
export { readManifest, resolveEntry, runTrace, traceStem } from "./trace.ts";
export type {
  ManifestEntry,
  TraceFile,
  TraceStepJs,
  TraceViolation,
} from "./trace-file.ts";

export type { Choice, Exploration, ExploreOptions, State } from "./explore.ts";
export {
  constantsOf,
  describeChange,
  startExploration,
  takeChoice,
  toTla,
  toTraceFile,
  undoChoice,
} from "./explore.ts";
export type { ExploreIo } from "./explore-cli.ts";
export { exploreInteractively } from "./explore-cli.ts";
