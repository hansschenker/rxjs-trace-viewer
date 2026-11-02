import type { ExecutionTrace } from "./execution-trace.ts";
import { fromTlaTrace, type FrameSet } from "./frames.ts";
import { fromExecutionTrace } from "./runtime.ts";
import type { TraceFile } from "./trace-file.ts";

/*
 * What a component accepts: a tla-ts trace file, a recorded run, or a
 * frame set that was built already. The two JSON shapes are told apart by
 * their arrays: a trace file has `steps`, a recording has `events`.
 */

export type TraceInput = TraceFile | ExecutionTrace | FrameSet;

export const isFrameSet = (input: TraceInput): input is FrameSet =>
  "frames" in input;
export const isExecutionTrace = (input: TraceInput): input is ExecutionTrace =>
  "events" in input;

export function toFrameSet(input: TraceInput): FrameSet {
  if (isFrameSet(input)) return input;
  if (isExecutionTrace(input)) return fromExecutionTrace(input);
  return fromTlaTrace(input);
}

export interface TraceText {
  readonly title: string;
  readonly subtitle: string;
  readonly note: string | undefined;
}

/** Title, subtitle and note for an input, each overridable. */
export function traceText(
  input: TraceInput,
  overrides: Partial<TraceText> = {},
): TraceText {
  const given = (key: keyof TraceText): string | undefined =>
    overrides[key] ?? undefined;
  if (isFrameSet(input)) {
    return {
      title: given("title") ?? "trace",
      subtitle: given("subtitle") ?? `${input.frames.length} frames`,
      note: given("note"),
    };
  }
  if (isExecutionTrace(input)) {
    const frames =
      input.events.filter((e) => e.subscriptionId !== undefined).length + 1;
    return {
      title: given("title") ?? input.title ?? input.sessionId,
      subtitle:
        given("subtitle") ??
        `recorded run · ${input.events.length} events · ${frames} frames`,
      note: given("note") ?? input.note,
    };
  }
  const violation =
    input.violation === null ? "" : ` · ${input.violation.name}`;
  return {
    title: given("title") ?? input.cfg.replace(/\.cfg$/, ""),
    subtitle:
      given("subtitle") ??
      `${input.module}.tla · ${input.status}${violation} · ${input.steps.length} frames`,
    note: given("note") ?? input.note,
  };
}
