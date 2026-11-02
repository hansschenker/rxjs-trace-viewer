import type { JsValue } from "./values.ts";

/*
 * The trace file: what `trace` writes to traces/<cfg>.json and what the
 * model adapter reads. Types only, so the core can import it without
 * pulling in tla-ts or Node.
 */

/** One state of a trace, with every variable converted to plain JavaScript. */
export interface TraceStepJs {
  readonly index: number;
  readonly action: string;
  readonly state: Readonly<Record<string, JsValue>>;
}

export interface TraceViolation {
  readonly name: string;
  /** Index of the state the trace loops back to, for liveness violations. */
  readonly loopStart: number | null;
}

export interface TraceFile {
  readonly cfg: string;
  readonly module: string;
  readonly status: string;
  readonly violation: TraceViolation | null;
  readonly steps: readonly TraceStepJs[];
  /** The module's VARIABLES in declaration order; lanes and the panel follow it. */
  readonly variables?: readonly string[];
  readonly family?: string;
  readonly note?: string;
}

/** One entry of the specs manifest of rxjs-operator-tla. */
export interface ManifestEntry {
  readonly module: string;
  readonly cfg: string;
  readonly expect?: string;
  readonly family?: string;
  readonly note?: string;
}
