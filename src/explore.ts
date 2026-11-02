import fs from "node:fs";
import path from "node:path";
import { check } from "tla-ts";
import { toJs } from "./tla-values.ts";
import { resolveEntry } from "./trace.ts";
import type { TraceFile, TraceStepJs } from "./trace-file.ts";
import { isJsArray, isJsRecord, type JsValue } from "./values.ts";

/*
 * Interactive exploration without a stepping API: the successors of a
 * concrete state are enumerated by model checking a generated wrapper
 * module. The wrapper pins the state as the initial state, bounds the
 * depth to one step with a state constraint, and declares the invariant
 * "the state is one already seen"; each violation is a new successor with
 * its action, and the loop ends when the check succeeds. Initial states
 * come from the same trick at depth zero.
 */

export type State = Readonly<Record<string, JsValue>>;

export interface Choice {
  readonly action: string;
  readonly state: State;
}

export interface ExploreOptions {
  /** Names in the spec; the RxBase conventions by default. */
  readonly init?: string;
  readonly next?: string;
  readonly vars?: string;
}

interface Spec {
  readonly module: string;
  readonly cfg: string;
  readonly constants: string;
  readonly modelValues: ReadonlySet<string>;
  readonly load: (name: string) => string | undefined;
  readonly names: Required<ExploreOptions>;
}

const KEYWORDS =
  /^(SPECIFICATION|INIT|NEXT|INVARIANTS?|PROPERT(Y|IES)|CONSTANTS?|CONSTRAINTS?|ACTION_CONSTRAINTS?|SYMMETRY|VIEW|CHECK_DEADLOCK)\b/;

/** The CONSTANT(S) block of a config, and the model values it declares. */
export function constantsOf(cfg: string): {
  block: string;
  modelValues: Set<string>;
} {
  const lines: string[] = [];
  let inside = false;
  for (const raw of cfg.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("\\*")) continue;
    const keyword = KEYWORDS.exec(line);
    if (keyword !== null) inside = keyword[1].startsWith("CONSTANT");
    if (inside) lines.push(line);
  }
  const modelValues = new Set<string>();
  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    if (m === null) continue;
    const rhs = m[2].trim();
    const inner =
      rhs.startsWith("{") && rhs.endsWith("}") ? rhs.slice(1, -1) : rhs;
    for (const token of inner.split(",")) {
      const id = token.trim();
      if (
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) &&
        !["TRUE", "FALSE"].includes(id)
      )
        modelValues.add(id);
    }
  }
  return { block: lines.join("\n"), modelValues };
}

/** A JsValue back as TLA+ syntax; model values bare, other strings quoted. */
export function toTla(v: JsValue, modelValues: ReadonlySet<string>): string {
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return modelValues.has(v) ? v : `"${v}"`;
  if (isJsArray(v))
    return `<<${v.map((x) => toTla(x, modelValues)).join(", ")}>>`;
  const entries = Object.entries(v);
  if (entries.every(([k]) => modelValues.has(k))) {
    return `(${entries.map(([k, x]) => `${k} :> ${toTla(x, modelValues)}`).join(" @@ ")})`;
  }
  return `[${entries.map(([k, x]) => `${k} |-> ${toTla(x, modelValues)}`).join(", ")}]`;
}

function loadSpec(
  specsDir: string,
  cfgName: string,
  options: ExploreOptions,
): Spec {
  const entry = resolveEntry(specsDir, cfgName);
  const cfg = fs.readFileSync(path.join(specsDir, entry.cfg), "utf8");
  const { block, modelValues } = constantsOf(cfg);
  const load = (name: string): string | undefined => {
    const file = path.join(specsDir, `${name}.tla`);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  };
  return {
    module: entry.module,
    cfg: entry.cfg,
    constants: block,
    modelValues,
    load,
    names: {
      init: options.init ?? "Init",
      next: options.next ?? "Next",
      vars: options.vars ?? "vars",
    },
  };
}

const stripDepth = (state: Record<string, unknown>): State => {
  const out: Record<string, JsValue> = {};
  for (const [k, v] of Object.entries(state))
    if (k !== "depth") out[k] = toJs(v as never);
  return out;
};

/** The variable names of a state, in the order of the spec's `vars` tuple when known. */
function tupleOf(state: State, spec: Spec, order: readonly string[]): string {
  const names = order.length > 0 ? order : Object.keys(state);
  return `<<${names.map((n) => toTla(state[n], spec.modelValues)).join(", ")}>>`;
}

async function enumerate(
  spec: Spec,
  pinned: State | null,
  order: readonly string[],
): Promise<Choice[]> {
  const found: Choice[] = [];
  const seen: string[] = pinned === null ? [] : [tupleOf(pinned, spec, order)];
  const { init, next, vars } = spec.names;
  // A violating trace of this length is a direct successor (or an initial
  // state); a longer one means every direct successor is already seen.
  const expectedLength = pinned === null ? 1 : 2;
  for (let guard = 0; guard < 200; guard++) {
    const seenSet = seen.length === 0 ? "{}" : `{${seen.join(", ")}}`;
    const mv = [...spec.modelValues];
    const pin =
      pinned === null
        ? init
        : (order.length > 0 ? order : Object.keys(pinned))
            .map((n) => `${n} = ${toTla(pinned[n], spec.modelValues)}`)
            .join(" /\\ ");
    const source = `---- MODULE Explore ----
EXTENDS ${spec.module}, TLC
${mv.length > 0 ? `CONSTANTS ${mv.join(", ")}` : ""}
ExploreInit == ${pin}
Seen == ${seenSet}
Unseen == ${vars} \\in Seen
====`;
    const config = `INIT ExploreInit
NEXT ${next}
INVARIANT Unseen
CHECK_DEADLOCK FALSE
${spec.constants}
${mv.map((v) => `${v} = ${v}`).join("\n")}
`;
    const result = await check({
      source,
      config,
      loadModule: spec.load,
      onPrint: () => {},
    });
    if (result.failure !== undefined)
      throw new Error(`${spec.cfg}: ${result.failure.message}`);
    if (result.violation === undefined) return found;
    if (result.violation.trace.length !== expectedLength) return found;
    const step = result.violation.trace[result.violation.trace.length - 1];
    const state = stripDepth(step.state);
    found.push({
      action: (
        step.action ??
        step.label ??
        (pinned === null ? "Init" : "?")
      ).replace(/@.*$/, ""),
      state,
    });
    seen.push(tupleOf(state, spec, order));
  }
  throw new Error(`${spec.cfg}: more than 200 successors; giving up`);
}

export interface Exploration {
  readonly specsDir: string;
  readonly cfg: string;
  readonly module: string;
  readonly variables: readonly string[];
  readonly steps: readonly TraceStepJs[];
  readonly choices: readonly Choice[];
}

/** Declared VARIABLES, needed to build `vars` tuples in the spec's order. */
function declaredVariables(spec: Spec): readonly string[] {
  const source = spec.load(spec.module) ?? "";
  const m = /VARIABLES?[ \t]+([\s\S]*?)(?=\r?\n[ \t]*\r?\n)/.exec(source);
  if (m === null) return [];
  return m[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/\\\*.*$/, ""))
    .join(" ")
    .split(/[,\s]+/)
    .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
}

/** Starts at an initial state (the first, when there are several) and lists what can happen. */
export async function startExploration(
  specsDir: string,
  cfgName: string,
  options: ExploreOptions = {},
): Promise<Exploration> {
  const spec = loadSpec(specsDir, cfgName, options);
  const variables = declaredVariables(spec);
  const initial = await enumerate(spec, null, variables);
  if (initial.length === 0) throw new Error(`${spec.cfg}: no initial state`);
  const first: TraceStepJs = {
    index: 0,
    action: "Init",
    state: initial[0].state,
  };
  const choices = await enumerate(spec, first.state, variables);
  return {
    specsDir,
    cfg: spec.cfg,
    module: spec.module,
    variables,
    steps: [first],
    choices,
  };
}

/** Takes choice `index` and lists what can happen next. */
export async function takeChoice(
  exploration: Exploration,
  index: number,
  options: ExploreOptions = {},
): Promise<Exploration> {
  const choice = exploration.choices[index];
  if (choice === undefined) throw new Error(`no choice ${index}`);
  const spec = loadSpec(exploration.specsDir, exploration.cfg, options);
  const step: TraceStepJs = {
    index: exploration.steps.length,
    action: choice.action,
    state: choice.state,
  };
  const choices = await enumerate(spec, step.state, exploration.variables);
  return { ...exploration, steps: [...exploration.steps, step], choices };
}

/** Back one step; the choices of the previous state are listed again. */
export async function undoChoice(
  exploration: Exploration,
  options: ExploreOptions = {},
): Promise<Exploration> {
  if (exploration.steps.length < 2) return exploration;
  const steps = exploration.steps.slice(0, -1);
  const spec = loadSpec(exploration.specsDir, exploration.cfg, options);
  const choices = await enumerate(
    spec,
    steps[steps.length - 1].state,
    exploration.variables,
  );
  return { ...exploration, steps, choices };
}

/** The exploration so far as a trace file, ready for renderTrace. */
export function toTraceFile(exploration: Exploration): TraceFile {
  return {
    cfg: exploration.cfg,
    module: exploration.module,
    status: "explored",
    violation: null,
    steps: exploration.steps,
    variables: exploration.variables,
    note: "explored by hand: each step was chosen from the enabled actions",
  };
}

/** What a choice changes, for the menu: `name: before -> after` per changed variable. */
export function describeChange(from: State, to: State): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(to)) {
    const before = from[k];
    if (before === undefined || JSON.stringify(before) !== JSON.stringify(v)) {
      parts.push(`${k}: ${short(before)} -> ${short(v)}`);
    }
  }
  return parts.join("; ");
}

const short = (v: JsValue | undefined): string => {
  if (v === undefined) return "?";
  if (isJsRecord(v) || isJsArray(v)) {
    const s = JSON.stringify(v);
    return s.length > 40 ? `${s.slice(0, 39)}…` : s;
  }
  return String(v);
};
