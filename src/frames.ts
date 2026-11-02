import type { TraceFile, TraceStepJs } from "./trace-file.ts";
import {
  isJsArray,
  isJsRecord,
  type JsRecord,
  type JsValue,
} from "./values.ts";

/*
 * FrameState: one animation frame's worth of state, in the vocabulary the
 * specs use. A stream is an append-only value log plus a status
 * (RxBase.tla); a subscription has a lifecycle; a tracked item is one
 * element of a sequence of records, such as Flatten's inner Observables;
 * everything else is shown verbatim in the internals panel. The model
 * adapter below (fromTlaTrace) fills it from a tla-ts trace; a runtime
 * adapter (milestone M3) will fill it from an ExecutionEvent log.
 */

export type Status = "active" | "complete" | "error";
export type SubState = "idle" | "on" | "off" | "complete" | "error";
export type LaneKind = "stream" | "item" | "sub";

export interface StreamState {
  readonly vals: readonly JsValue[];
  readonly status: Status;
}

export interface FrameState {
  /** Index of the state in the trace; the initial state is 0. */
  readonly step: number;
  /** Time column: the spec's `now` when it has logical time, else the step. */
  readonly column: number;
  /** The action that produced this state; "Init" for the first one. */
  readonly action: string;
  readonly streams: Readonly<Record<string, StreamState>>;
  /** Subscription lifecycles, keyed by lane name. */
  readonly subs: Readonly<Record<string, SubState>>;
  /** Tracked items, keyed by lane name; null before the item exists. */
  readonly items: Readonly<Record<string, JsRecord | null>>;
  /** Every other variable, verbatim, in the spec's order. */
  readonly internals: Readonly<Record<string, JsValue>>;
}

export interface Lane {
  readonly name: string;
  readonly kind: LaneKind;
}

export interface FrameSet {
  readonly frames: readonly FrameState[];
  readonly hasTime: boolean;
  readonly loopStart: number | null;
  /** Lanes in display order: the order of the spec's variables. */
  readonly lanes: readonly Lane[];
}

type State = Readonly<Record<string, JsValue>>;

const STATUS: ReadonlySet<string> = new Set(["active", "complete", "error"]);
const SUB_STATES: ReadonlySet<string> = new Set([
  "idle",
  "on",
  "off",
  "complete",
  "error",
]);
const SUB_TO_STATUS: Readonly<Record<SubState, Status>> = {
  idle: "active",
  on: "active",
  off: "active",
  complete: "complete",
  error: "error",
};

/** A sequence of scalars or tuples: the value log of a stream. */
const isValueLog = (v: JsValue | undefined): v is readonly JsValue[] =>
  isJsArray(v) && v.every((x) => typeof x !== "object" || isJsArray(x));

const isRecordSeq = (v: JsValue | undefined): v is readonly JsRecord[] =>
  isJsArray(v) && v.every(isJsRecord);

const asLog = (v: JsValue | undefined): readonly JsValue[] =>
  isValueLog(v) ? v : [];

const asRecordSeq = (v: JsValue | undefined): readonly JsRecord[] =>
  isRecordSeq(v) ? v : [];

const asStatus = (v: JsValue | undefined): Status =>
  typeof v === "string" && STATUS.has(v) ? (v as Status) : "active";

const asSub = (v: JsValue | undefined): SubState =>
  typeof v === "string" && SUB_STATES.has(v) ? (v as SubState) : "idle";

const at = (v: JsValue | undefined, key: string): JsValue | undefined =>
  isJsRecord(v) ? v[key] : undefined;

const same = (a: JsValue, b: JsValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * True when `get` is a value log in every state and only ever grows by
 * appending: the Contract of RxBase.tla. A sliding buffer fails this and
 * stays in the internals panel.
 */
function appendOnly(
  steps: readonly TraceStepJs[],
  get: (s: State) => JsValue | undefined,
): boolean {
  if (!isValueLog(get(steps[0].state))) return false;
  for (let i = 1; i < steps.length; i++) {
    const a = get(steps[i - 1].state);
    const b = get(steps[i].state);
    if (!isValueLog(a) || !isValueLog(b) || a.length > b.length) return false;
    for (let j = 0; j < a.length; j++) if (!same(a[j], b[j])) return false;
  }
  return true;
}

interface LanePlan {
  readonly name: string;
  readonly kind: LaneKind;
  readonly vals: (s: State) => readonly JsValue[];
  readonly status: (s: State) => Status;
  readonly sub: ((s: State) => SubState) | null;
  readonly item: ((s: State) => JsRecord | null) | null;
}

interface Plan {
  readonly lanes: readonly LanePlan[];
  readonly consumed: ReadonlySet<string>;
}

const noVals = (): readonly JsValue[] => [];
const active = (): Status => "active";

/** The variables of a state in the spec's order; unknown ones after, in state order. */
function orderedNames(
  first: State,
  order: readonly string[],
): readonly string[] {
  return [
    ...order.filter((n) => n in first),
    ...Object.keys(first).filter((n) => !order.includes(n)),
  ];
}

/**
 * Decides which variables are lanes, by the conventions of the specs:
 *   - an append-only sequence `x` is a stream, with status `xDone` when
 *     that exists;
 *   - a function to append-only sequences, `received[s]`, is one stream
 *     per key, with its lifecycle in `sub[s]` when that exists;
 *   - a sequence of records, `inner`, is one tracked item per element;
 *   - a function to subscription states is one lifecycle lane per key,
 *     unless a stream lane already shows it.
 */
function plan(steps: readonly TraceStepJs[], names: readonly string[]): Plan {
  const first = steps[0].state;
  const last = steps[steps.length - 1].state;
  const lanes: LanePlan[] = [];
  const consumed = new Set<string>();
  const subShownBy = new Set<string>();
  const subMaps: string[] = [];

  const streamKeysOf = (name: string): readonly string[] | null => {
    const value = first[name];
    if (!isJsRecord(value)) return null;
    const keys = Object.keys(value);
    const allLogs = keys.every((k) => appendOnly(steps, (s) => at(s[name], k)));
    return keys.length > 0 && allLogs ? keys : null;
  };

  for (const name of names) {
    if (appendOnly(steps, (s) => s[name])) {
      const done = `${name}Done`;
      const hasDone =
        typeof first[done] === "string" && STATUS.has(first[done]);
      consumed.add(name);
      if (hasDone) consumed.add(done);
      lanes.push({
        name,
        kind: "stream",
        vals: (s) => asLog(s[name]),
        status: hasDone ? (s) => asStatus(s[done]) : active,
        sub: null,
        item: null,
      });
      continue;
    }
    const keys = streamKeysOf(name);
    if (keys !== null) {
      consumed.add(name);
      for (const key of keys) {
        const hasSub = at(first.sub, key) !== undefined;
        if (hasSub) subShownBy.add(key);
        lanes.push({
          name: `${name}[${key}]`,
          kind: "stream",
          vals: (s) => asLog(at(s[name], key)),
          status: hasSub ? (s) => SUB_TO_STATUS[asSub(at(s.sub, key))] : active,
          sub: hasSub ? (s) => asSub(at(s.sub, key)) : null,
          item: null,
        });
      }
      continue;
    }
    const everyRecordSeq = steps.every((st) => isRecordSeq(st.state[name]));
    if (isJsArray(first[name]) && isRecordSeq(last[name]) && everyRecordSeq) {
      const count = Math.max(
        ...steps.map((st) => asRecordSeq(st.state[name]).length),
      );
      if (count > 0) {
        consumed.add(name);
        for (let k = 1; k <= count; k++) {
          lanes.push({
            name: `${name}[${k}]`,
            kind: "item",
            vals: noVals,
            status: active,
            sub: null,
            item: (s) => asRecordSeq(s[name])[k - 1] ?? null,
          });
        }
      }
      continue;
    }
    const value = last[name];
    const isSubMap =
      isJsRecord(value) &&
      Object.values(value).every(
        (x) => typeof x === "string" && SUB_STATES.has(x),
      );
    if (isSubMap) subMaps.push(name);
  }

  // Lifecycle maps come last, so that stream lanes have claimed their keys.
  for (const name of subMaps) {
    const value = last[name];
    if (!isJsRecord(value)) continue;
    consumed.add(name);
    for (const key of Object.keys(value)) {
      if (name === "sub" && subShownBy.has(key)) continue;
      lanes.push({
        name: `${name}[${key}]`,
        kind: "sub",
        vals: noVals,
        status: active,
        sub: (s) => asSub(at(s[name], key)),
        item: null,
      });
    }
  }

  return { lanes, consumed };
}

/** The model adapter: a tla-ts trace becomes one FrameState per state. */
export function fromTlaTrace(trace: TraceFile): FrameSet {
  const { steps } = trace;
  if (steps.length === 0) {
    return { frames: [], hasTime: false, loopStart: null, lanes: [] };
  }
  const names = orderedNames(steps[0].state, trace.variables ?? []);
  const { lanes, consumed } = plan(steps, names);
  const hasTime = typeof steps[0].state.now === "number";

  const frames = steps.map((step): FrameState => {
    const s = step.state;
    const streams: Record<string, StreamState> = {};
    const subs: Record<string, SubState> = {};
    const items: Record<string, JsRecord | null> = {};
    for (const p of lanes) {
      if (p.kind === "stream")
        streams[p.name] = { vals: p.vals(s), status: p.status(s) };
      if (p.sub !== null) subs[p.name] = p.sub(s);
      if (p.item !== null) items[p.name] = p.item(s);
    }
    const internals: Record<string, JsValue> = {};
    for (const name of names) {
      if (consumed.has(name) || (hasTime && name === "now")) continue;
      internals[name] = s[name];
    }
    const now = s.now;
    return {
      step: step.index,
      column: hasTime && typeof now === "number" ? now : step.index,
      action: step.action,
      streams,
      subs,
      items,
      internals,
    };
  });

  return {
    frames,
    hasTime,
    loopStart: trace.violation?.loopStart ?? null,
    lanes: lanes.map(({ name, kind }) => ({ name, kind })),
  };
}
