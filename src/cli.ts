import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAnimationHtml } from "./animate.ts";
import { fromTlaTrace } from "./frames.ts";
import { runTrace, traceStem, type TraceFile } from "./trace.ts";
import { buildTimeline, layoutFor, renderFrame } from "./view.ts";

/*
 * Usage:
 *   node src/cli.ts trace   [cfg ...]   check with tla-ts, write traces/<cfg>.json
 *   node src/cli.ts render  [cfg ...]   read traces/<cfg>.json, write out/<cfg>.html
 *   node src/cli.ts animate [cfg ...]   both
 * Options:
 *   --specs <dir>    where the .tla, .cfg and manifest.json live
 *                    (default: ../rxjs-operator-tla/specs next to this repo)
 *   --traces <dir>   default: traces
 *   --out <dir>      default: out
 * With no cfg, the four bug demos of the specs manifest are used.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEMOS = [
  "Flatten_bug_mergeForSwitch.cfg",
  "Flatten_stall_concat.cfg",
  "Share_leak_demo.cfg",
  "CombineLatest_SilentB.cfg",
];

interface Options {
  readonly command: string;
  readonly cfgs: readonly string[];
  readonly specs: string;
  readonly traces: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): Options {
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
    path.resolve(root, opts[key] ?? fallback);
  return {
    command,
    cfgs: cfgs.length > 0 ? cfgs : DEMOS,
    specs: dir("specs", "../rxjs-operator-tla/specs"),
    traces: dir("traces", "traces"),
    out: dir("out", "out"),
  };
}

async function trace(o: Options, cfg: string): Promise<TraceFile> {
  const file = await runTrace(o.specs, cfg);
  fs.mkdirSync(o.traces, { recursive: true });
  const target = path.join(o.traces, `${traceStem(cfg)}.json`);
  fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
  const what = file.violation === null ? "no counterexample" : `${file.violation.name}, ${file.steps.length} states`;
  console.log(`${cfg}: ${file.status} (${what}) -> ${path.relative(root, target)}`);
  return file;
}

function render(o: Options, cfg: string): void {
  const source = path.join(o.traces, `${traceStem(cfg)}.json`);
  if (!fs.existsSync(source)) throw new Error(`${source} not found; run trace first`);
  const file = JSON.parse(fs.readFileSync(source, "utf8")) as TraceFile;
  if (file.steps.length === 0) {
    console.log(`${cfg}: ${file.status}, nothing to animate`);
    return;
  }
  const set = fromTlaTrace(file);
  const timeline = buildTimeline(set);
  const layout = layoutFor(set, timeline);
  const frames = set.frames.map((_, i) => renderFrame(set, timeline, layout, i));
  const html = renderAnimationHtml({
    title: traceStem(cfg),
    subtitle: `${file.module}.tla · ${file.status}${file.violation === null ? "" : ` · ${file.violation.name}`} · ${set.frames.length} frames`,
    note: file.note,
    width: layout.width,
    height: layout.height,
    frames,
    steps: set.frames.map((f) => f.action),
    loopStart: set.loopStart,
  });
  fs.mkdirSync(o.out, { recursive: true });
  const target = path.join(o.out, `${traceStem(cfg)}.html`);
  fs.writeFileSync(target, html);
  console.log(`${cfg}: ${set.frames.length} frames, ${timeline.lanes.length} lanes -> ${path.relative(root, target)}`);
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  switch (o.command) {
    case "trace":
      for (const cfg of o.cfgs) await trace(o, cfg);
      break;
    case "render":
      for (const cfg of o.cfgs) render(o, cfg);
      break;
    case "animate":
      for (const cfg of o.cfgs) {
        await trace(o, cfg);
        render(o, cfg);
      }
      break;
    default:
      throw new Error(`unknown command ${o.command}; use trace, render or animate`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
