import fs from "node:fs";
import path from "node:path";
import { check, parseModule, type TraceStep } from "tla-ts";
import { toJs, type JsValue } from "./tla-values.ts";

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

/** What `trace` writes to traces/<cfg>.json and `render` reads back. */
export interface TraceFile {
  readonly cfg: string;
  readonly module: string;
  readonly status: string;
  readonly violation: TraceViolation | null;
  readonly steps: readonly TraceStepJs[];
  /** The module's VARIABLES in declaration order; lanes follow it. */
  readonly variables?: readonly string[];
  readonly family?: string;
  readonly note?: string;
}

export interface ManifestEntry {
  readonly module: string;
  readonly cfg: string;
  readonly expect?: string;
  readonly family?: string;
  readonly note?: string;
}

export function readManifest(specsDir: string): readonly ManifestEntry[] {
  const file = path.join(specsDir, "manifest.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")) as ManifestEntry[];
}

/** The manifest entry for a config, or a guess from the config's name. */
export function resolveEntry(specsDir: string, cfgName: string): ManifestEntry {
  const cfg = cfgName.endsWith(".cfg") ? cfgName : `${cfgName}.cfg`;
  const found = readManifest(specsDir).find((e) => e.cfg === cfg);
  return found ?? { module: cfg.split(/[_.]/)[0], cfg };
}

/** Runs tla-ts on one config and returns the counterexample as a TraceFile. */
export async function runTrace(
  specsDir: string,
  cfgName: string,
): Promise<TraceFile> {
  const entry = resolveEntry(specsDir, cfgName);
  const load = (name: string): string | undefined => {
    const file = path.join(specsDir, `${name}.tla`);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  };
  const source = load(entry.module);
  if (source === undefined) {
    throw new Error(`module ${entry.module}.tla not found in ${specsDir}`);
  }
  const result = await check({
    source,
    config: fs.readFileSync(path.join(specsDir, entry.cfg), "utf8"),
    loadModule: load,
    onPrint: () => {},
  });
  if (result.failure !== undefined) {
    throw new Error(`${entry.cfg}: ${result.failure.message}`);
  }
  const violation = result.violation;
  return {
    cfg: entry.cfg,
    module: entry.module,
    status: result.status,
    violation:
      violation === undefined
        ? null
        : { name: violation.name, loopStart: violation.loopStart ?? null },
    steps: (violation?.trace ?? []).map(convertStep),
    variables: declaredVariables(source),
    family: entry.family,
    note: entry.note,
  };
}

function declaredVariables(source: string): readonly string[] {
  try {
    return parseModule(source).variables.map((d) => d.name);
  } catch {
    return [];
  }
}

function convertStep(step: TraceStep, index: number): TraceStepJs {
  const state: Record<string, JsValue> = {};
  for (const [name, value] of Object.entries(step.state)) {
    state[name] = toJs(value);
  }
  return {
    index,
    action: index === 0 ? "Init" : (step.action ?? step.label ?? "?"),
    state,
  };
}

export const traceStem = (cfgName: string): string =>
  path.basename(cfgName).replace(/\.cfg$/, "");
