import type {
  ExecutionEvent,
  ExecutionTrace,
  JsonValue,
} from "./execution-trace.ts";
import type {
  FrameSet,
  FrameState,
  Lane,
  Status,
  StreamState,
  SubState,
} from "./frames.ts";
import type { JsValue } from "./values.ts";
import { shortLabel } from "./view.ts";

/*
 * The runtime adapter: an execution log becomes one FrameState per event.
 * The log is a list of actions, not states, so this is the fold the design
 * note promised: each event is applied to the state after the previous
 * one. One lane per subscription (a cold source subscribed twice is two
 * lanes), with the subscription's lifecycle on its own lane, as the share
 * specs show it. Columns are the distinct event times.
 */

type TimelineEvent = Exclude<
  ExecutionEvent,
  { kind: "session-started" | "session-ended" }
> & { readonly subscriptionId: string };

const isTimelineEvent = (e: ExecutionEvent): e is TimelineEvent =>
  e.subscriptionId !== undefined &&
  e.kind !== "session-started" &&
  e.kind !== "session-ended";

interface Subscription {
  readonly id: string;
  readonly label: string;
  readonly parent: string | null;
  readonly first: number;
  lane: string;
}

interface LaneState {
  vals: JsValue[];
  status: Status;
  sub: SubState;
}

/** JSON from the debugger's export boundary as a JsValue; null has no TLA+ counterpart. */
export function fromJson(v: JsonValue): JsValue {
  if (v === null) return "null";
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(fromJson);
  const record: Record<string, JsValue> = {};
  for (const [k, x] of Object.entries(v)) record[k] = fromJson(x);
  return record;
}

/** Lane names and order: by label, then first subscription; children right after their parent. */
function planLanes(
  events: readonly TimelineEvent[],
  labels: readonly string[],
): readonly Subscription[] {
  const subs = new Map<string, Subscription>();
  for (const e of events) {
    if (subs.has(e.subscriptionId)) continue;
    subs.set(e.subscriptionId, {
      id: e.subscriptionId,
      label: e.label ?? e.observableId,
      parent: e.parentSubscriptionId ?? null,
      first: e.sequence,
      lane: "",
    });
  }
  const byLabel = new Map<string, Subscription[]>();
  for (const s of subs.values()) {
    const list = byLabel.get(s.label) ?? [];
    list.push(s);
    byLabel.set(s.label, list);
  }
  for (const list of byLabel.values()) {
    list.forEach((s, i) => {
      s.lane = list.length === 1 ? s.label : `${s.label}[${i + 1}]`;
    });
  }
  const rank = (s: Subscription): number => {
    const i = labels.indexOf(s.label);
    return i === -1 ? labels.length : i;
  };
  const byDisplay = (a: Subscription, b: Subscription): number =>
    rank(a) - rank(b) || a.first - b.first;
  const all = [...subs.values()];
  const ordered: Subscription[] = [];
  const place = (s: Subscription): void => {
    ordered.push(s);
    all
      .filter((c) => c.parent === s.id)
      .sort(byDisplay)
      .forEach(place);
  };
  all
    .filter((s) => s.parent === null || !subs.has(s.parent))
    .sort(byDisplay)
    .forEach(place);
  return ordered;
}

function describe(e: TimelineEvent, lane: string): string {
  switch (e.kind) {
    case "next":
      return `${lane}: next ${shortLabel(fromJson(e.value))}`;
    case "error":
      return `${lane}: error ${shortLabel(fromJson(e.error))}`;
    case "unsubscribe":
      return `${lane}: unsubscribe (${e.reason})`;
    default:
      return `${lane}: ${e.kind}`;
  }
}

function apply(state: LaneState, e: TimelineEvent): void {
  switch (e.kind) {
    case "subscribe":
      state.sub = "on";
      state.status = "active";
      break;
    case "next":
      state.vals.push(fromJson(e.value));
      break;
    case "complete":
      state.status = "complete";
      state.sub = "complete";
      break;
    case "error":
      state.status = "error";
      state.sub = "error";
      break;
    case "unsubscribe":
      if (e.reason === "cancel" && state.sub === "on") state.sub = "off";
      break;
  }
}

const ms = (t: number): string => `${Math.round(t * 10) / 10}ms`;

/** The runtime adapter: an rxjs-execution-debugger trace becomes a FrameSet. */
export function fromExecutionTrace(trace: ExecutionTrace): FrameSet {
  const events = [...trace.events]
    .sort((a, b) => a.sequence - b.sequence)
    .filter(isTimelineEvent);
  const subs = planLanes(events, trace.labels ?? []);
  const lanes: Lane[] = subs.map((s) => ({ name: s.lane, kind: "stream" }));
  const laneOf = new Map(subs.map((s) => [s.id, s.lane]));
  const times = [...new Set(events.map((e) => e.at))].sort((a, b) => a - b);
  const columnOf = new Map(times.map((t, i) => [t, i]));

  const state = new Map<string, LaneState>(
    lanes.map((l) => [l.name, { vals: [], status: "active", sub: "idle" }]),
  );
  const snapshot = (
    step: number,
    column: number,
    action: string,
  ): FrameState => {
    const streams: Record<string, StreamState> = {};
    const subStates: Record<string, SubState> = {};
    const active: string[] = [];
    for (const [name, s] of state) {
      streams[name] = { vals: [...s.vals], status: s.status };
      subStates[name] = s.sub;
      if (s.sub === "on") active.push(name);
    }
    return {
      step,
      column,
      action,
      streams,
      subs: subStates,
      items: {},
      internals: { active },
    };
  };

  const frames: FrameState[] = [snapshot(0, 0, "Init")];
  events.forEach((e, i) => {
    const lane = laneOf.get(e.subscriptionId) ?? e.subscriptionId;
    const s = state.get(lane);
    if (s !== undefined) apply(s, e);
    frames.push(snapshot(i + 1, columnOf.get(e.at) ?? 0, describe(e, lane)));
  });

  return {
    frames,
    hasTime: true,
    loopStart: null,
    lanes,
    columnLabels: times.map(ms),
    axisLabel: "time",
  };
}
