#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderGalleryFragment,
  renderGalleryHtml,
  type GalleryItem,
} from "./animate.ts";
import { parseArgs, type Options } from "./cli-args.ts";
import type { ExecutionTrace } from "./execution-trace.ts";
import { renderExecutionTrace, renderTrace } from "./render.ts";
import { runTrace, traceStem } from "./trace.ts";
import type { TraceFile } from "./trace-file.ts";

/*
 * Usage:
 *   rxjs-trace-viewer trace          [cfg ...]   check with tla-ts, write traces/<cfg>.json
 *   rxjs-trace-viewer render         [cfg ...]   read traces/<cfg>.json, write out/<cfg>.html
 *   rxjs-trace-viewer animate        [cfg ...]   both
 *   rxjs-trace-viewer render-runtime [name ...]  read traces/runtime/<name>.json, write out/runtime/<name>.html
 *   rxjs-trace-viewer gallery                    every trace and recording on one page: out/gallery.html
 * Options:
 *   --specs <dir>    where the .tla, .cfg and manifest.json live
 *                    (default: ../rxjs-operator-tla/specs next to this package)
 *   --traces <dir>   default: traces        --runtime <dir>  default: traces/runtime
 *   --out <dir>      default: out
 * With no cfg, the four bug demos of the specs manifest are used; with no
 * name, every recording. During development: node src/cli.ts <command> ...
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p: string): string => path.relative(root, p);
const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(file, "utf8")) as T;
const write = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const jsonFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];

async function trace(o: Options, cfg: string): Promise<TraceFile> {
  const file = await runTrace(o.specs, cfg);
  const target = path.join(o.traces, `${traceStem(cfg)}.json`);
  write(target, `${JSON.stringify(file, null, 2)}\n`);
  const what =
    file.violation === null
      ? "no counterexample"
      : `${file.violation.name}, ${file.steps.length} states`;
  console.log(`${cfg}: ${file.status} (${what}) -> ${rel(target)}`);
  return file;
}

function render(o: Options, cfg: string): void {
  const source = path.join(o.traces, `${traceStem(cfg)}.json`);
  if (!fs.existsSync(source))
    throw new Error(`${source} not found; run trace first`);
  const file = readJson<TraceFile>(source);
  if (file.steps.length === 0) {
    console.log(`${cfg}: ${file.status}, nothing to animate`);
    return;
  }
  const { set, timeline, html } = renderTrace(file, { title: traceStem(cfg) });
  const target = path.join(o.out, `${traceStem(cfg)}.html`);
  write(target, html);
  console.log(
    `${cfg}: ${set.frames.length} frames, ${timeline.lanes.length} lanes -> ${rel(target)}`,
  );
}

function renderRuntime(o: Options, name: string): void {
  const stem = name.replace(/\.json$/, "");
  const source = path.join(o.runtime, `${stem}.json`);
  if (!fs.existsSync(source))
    throw new Error(`${source} not found; record it first`);
  const recording = readJson<ExecutionTrace>(source);
  const { set, timeline, html } = renderExecutionTrace(recording, {
    title: stem,
  });
  const target = path.join(o.out, "runtime", `${stem}.html`);
  write(target, html);
  console.log(
    `${stem}: ${set.frames.length} frames, ${timeline.lanes.length} lanes -> ${rel(target)}`,
  );
}

function gallery(o: Options): void {
  const items: GalleryItem[] = [];
  for (const f of jsonFiles(o.traces)) {
    const file = readJson<TraceFile>(path.join(o.traces, f));
    if (file.steps.length === 0) continue;
    const stem = f.replace(/\.json$/, "");
    items.push({
      id: `model-${stem}`,
      group: "Model: tla-ts counterexamples",
      page: renderTrace(file, { title: stem }).page,
    });
  }
  for (const f of jsonFiles(o.runtime)) {
    const recording = readJson<ExecutionTrace>(path.join(o.runtime, f));
    const stem = f.replace(/\.json$/, "");
    items.push({
      id: `runtime-${stem}`,
      group: "Runtime: recorded RxJS 7",
      page: renderExecutionTrace(recording, { title: stem }).page,
    });
  }
  if (items.length === 0)
    throw new Error("nothing to show: no traces or recordings found");
  const page = {
    title: "RxJS Trace Viewer",
    intro:
      "One SVG frame per state, after the TLA+ Animation module. Model animations come from tla-ts counterexamples of the rxjs-operator-tla specs; runtime animations are recordings of the real RxJS 7 operators through rxjs-execution-debugger.",
    items,
  };
  const html = path.join(o.out, "gallery.html");
  const fragment = path.join(o.out, "gallery.fragment.html");
  write(html, renderGalleryHtml(page));
  write(fragment, renderGalleryFragment(page));
  console.log(
    `gallery: ${items.length} animations -> ${rel(html)}, ${rel(fragment)}`,
  );
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2), root);
  switch (o.command) {
    case "trace":
      for (const cfg of o.names) await trace(o, cfg);
      break;
    case "render":
      for (const cfg of o.names) render(o, cfg);
      break;
    case "animate":
      for (const cfg of o.names) {
        await trace(o, cfg);
        render(o, cfg);
      }
      break;
    case "render-runtime":
      for (const name of o.names.length > 0 ? o.names : jsonFiles(o.runtime)) {
        renderRuntime(o, name);
      }
      break;
    case "gallery":
      gallery(o);
      break;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
