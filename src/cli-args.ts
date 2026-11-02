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

export interface Options {
  readonly command: string;
  readonly cfgs: readonly string[];
  /** Where the .tla, .cfg and manifest.json live. */
  readonly specs: string;
  readonly traces: string;
  readonly out: string;
}

/**
 * `<command> [cfg ...] [--specs dir] [--traces dir] [--out dir]`.
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
  const [command = "animate", ...cfgs] = positional;
  const dir = (key: string, fallback: string): string =>
    path.resolve(base, opts[key] ?? fallback);
  return {
    command,
    cfgs: cfgs.length > 0 ? cfgs : DEMOS,
    specs: dir("specs", "../rxjs-operator-tla/specs"),
    traces: dir("traces", "traces"),
    out: dir("out", "out"),
  };
}
