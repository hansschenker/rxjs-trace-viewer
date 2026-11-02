#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type Options } from "./cli-args.ts";
import { renderTrace } from "./render.ts";
import { runTrace, traceStem } from "./trace.ts";
import type { TraceFile } from "./trace-file.ts";

/*
 * Usage:
 *   tla-rxjs-svg trace   [cfg ...]   check with tla-ts, write traces/<cfg>.json
 *   tla-rxjs-svg render  [cfg ...]   read traces/<cfg>.json, write out/<cfg>.html
 *   tla-rxjs-svg animate [cfg ...]   both
 * Options:
 *   --specs <dir>    where the .tla, .cfg and manifest.json live
 *                    (default: ../rxjs-operator-tla/specs next to this package)
 *   --traces <dir>   default: traces
 *   --out <dir>      default: out
 * With no cfg, the four bug demos of the specs manifest are used.
 * During development: node src/cli.ts <command> ...
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function trace(o: Options, cfg: string): Promise<TraceFile> {
  const file = await runTrace(o.specs, cfg);
  fs.mkdirSync(o.traces, { recursive: true });
  const target = path.join(o.traces, `${traceStem(cfg)}.json`);
  fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
  const what =
    file.violation === null
      ? "no counterexample"
      : `${file.violation.name}, ${file.steps.length} states`;
  console.log(
    `${cfg}: ${file.status} (${what}) -> ${path.relative(root, target)}`,
  );
  return file;
}

function render(o: Options, cfg: string): void {
  const source = path.join(o.traces, `${traceStem(cfg)}.json`);
  if (!fs.existsSync(source))
    throw new Error(`${source} not found; run trace first`);
  const file = JSON.parse(fs.readFileSync(source, "utf8")) as TraceFile;
  if (file.steps.length === 0) {
    console.log(`${cfg}: ${file.status}, nothing to animate`);
    return;
  }
  const { set, timeline, html } = renderTrace(file, { title: traceStem(cfg) });
  fs.mkdirSync(o.out, { recursive: true });
  const target = path.join(o.out, `${traceStem(cfg)}.html`);
  fs.writeFileSync(target, html);
  console.log(
    `${cfg}: ${set.frames.length} frames, ${timeline.lanes.length} lanes -> ${path.relative(root, target)}`,
  );
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2), root);
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
      throw new Error(
        `unknown command ${o.command}; use trace, render or animate`,
      );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
