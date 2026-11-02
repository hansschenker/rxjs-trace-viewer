import path from "node:path";

/*
 * Command line parsing for the CLI, kept apart from cli.ts so it can be
 * tested without running anything.
 */

/** The four bug demos of the rxjs-operator-tla specs manifest. */
export const DEMOS: readonly string[] = [
  "Flatten_bug_mergeForSwitch.cfg",
  "Flatten_stall_concat.cfg",
  "Share_leak_demo.cfg",
  "CombineLatest_SilentB.cfg",
];

export const COMMANDS = [
  "trace",
  "render",
  "animate",
  "render-runtime",
  "gallery",
] as const;
export type Command = (typeof COMMANDS)[number];

export interface Options {
  readonly command: Command;
  /** Configs for trace, render and animate; recording names for render-runtime. */
  readonly names: readonly string[];
  /** Where the .tla, .cfg and manifest.json live. */
  readonly specs: string;
  readonly traces: string;
  /** Where recorded runs live, as rxjs-execution-debugger exports them. */
  readonly runtime: string;
  readonly out: string;
}

const isCommand = (s: string): s is Command =>
  (COMMANDS as readonly string[]).includes(s);

/**
 * `<command> [name ...] [--specs dir] [--traces dir] [--runtime dir] [--out dir]`.
 * Directories resolve against `base`; the specs default to the
 * rxjs-operator-tla checkout next to this package.
 */
export function parseArgs(argv: readonly string[], base: string): Options {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      opts[arg.slice(2)] = value;
      i++;
    } else {
      positional.push(arg);
    }
  }
  const [command = "animate", ...names] = positional;
  if (!isCommand(command)) {
    throw new Error(`unknown command ${command}; use ${COMMANDS.join(", ")}`);
  }
  const dir = (key: string, fallback: string): string =>
    path.resolve(base, opts[key] ?? fallback);
  const defaults = command === "render-runtime" ? [] : DEMOS;
  return {
    command,
    names: names.length > 0 ? names : defaults,
    specs: dir("specs", "../rxjs-operator-tla/specs"),
    traces: dir("traces", "traces"),
    runtime: dir("runtime", "traces/runtime"),
    out: dir("out", "out"),
  };
}
