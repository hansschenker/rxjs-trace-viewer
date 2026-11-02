/*
 * The exported trace of rxjs-execution-debugger (schema version 1), as this
 * package reads it. Structurally the same as ExportedExecutionTrace there,
 * declared here so the core has no dependency on that package.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type UnsubscribeReason = "cancel" | "complete" | "error";

interface EventBase {
  /** Append order within the session: the exact event order. */
  readonly sequence: number;
  /** Milliseconds since the session started; synchronous events share it. */
  readonly at: number;
  readonly observableId: string;
  readonly subscriptionId?: string;
  readonly parentSubscriptionId?: string;
  /** The trace point's label, such as `source`, `inner` or `sink`. */
  readonly label?: string;
  readonly schemaVersion?: number;
  readonly sessionId?: string;
}

export interface SubscribeEvent extends EventBase {
  readonly kind: "subscribe";
  readonly subscriptionId: string;
}
export interface NextEvent extends EventBase {
  readonly kind: "next";
  readonly value: JsonValue;
}
export interface ErrorEvent extends EventBase {
  readonly kind: "error";
  readonly error: JsonValue;
}
export interface CompleteEvent extends EventBase {
  readonly kind: "complete";
}
export interface UnsubscribeEvent extends EventBase {
  readonly kind: "unsubscribe";
  readonly subscriptionId: string;
  readonly reason: UnsubscribeReason;
}
export interface SessionEvent extends EventBase {
  readonly kind: "session-started" | "session-ended";
}

export type ExecutionEvent =
  | SubscribeEvent
  | NextEvent
  | ErrorEvent
  | CompleteEvent
  | UnsubscribeEvent
  | SessionEvent;

export interface ExecutionTrace {
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly events: readonly ExecutionEvent[];
  /**
   * Display order of lanes by label, the runtime counterpart of a spec's
   * VARIABLES; unknown labels come after, in order of first subscription.
   */
  readonly labels?: readonly string[];
  readonly title?: string;
  readonly note?: string;
}
