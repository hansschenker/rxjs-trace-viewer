#!/usr/bin/env node
// Records the demo scenarios with the real RxJS 7 operators, through the
// trace() operator of rxjs-execution-debugger, under TestScheduler virtual
// time so every run is deterministic. Writes traces/runtime/<name>.json in
// the debugger's exported format, plus title, note and lane labels.
//
//   node scripts/record-runtime.mjs [--debugger ../rxjs-execution-debugger] [--out traces/runtime]
//
// Needs a built checkout of rxjs-execution-debugger (packages/*/dist) with
// its node_modules; everything is loaded from there so the recorded
// operators are that checkout's RxJS. Plain JavaScript on purpose: this is
// a harness over external checkouts, not part of the package.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const debuggerDir = path.resolve(root, option("--debugger", "../rxjs-execution-debugger"));
const outDir = path.resolve(root, option("--out", "traces/runtime"));

const require = createRequire(path.join(debuggerDir, "package.json"));
const rx = require("rxjs");
const { TestScheduler } = require("rxjs/testing");
const core = require(path.join(debuggerDir, "packages/core/dist/index.js"));
const { trace, traceProjection } = require(path.join(debuggerDir, "packages/rxjs/dist/index.js"));

const { timer, of, concat, NEVER, combineLatest, take, map, mergeMap, switchMap, concatMap, shareReplay, share } = rx;

/** @type {Array<{name: string, title: string, note: string, labels: string[], run: (session: any, scheduler: any) => void}>} */
const scenarios = [
  {
    name: "mergeMap_stale_inner",
    title: "mergeMap where switchMap was intended",
    note: "The outer delivers 0 at 0ms and 1 at 20ms; each inner delivers two values 10ms and 30ms after it starts. With mergeMap the first inner keeps running, so 1.2 arrives after 2.1: the stale result the Flatten bug demo finds.",
    labels: ["source", "inner", "sink"],
    run(session) {
      const inner = (k) => timer(10, 20).pipe(take(2), map((j) => `${k + 1}.${j + 1}`));
      timer(0, 20)
        .pipe(take(2), trace("source", session), mergeMap(traceProjection("inner", session, inner)), trace("sink", session))
        .subscribe();
    },
  },
  {
    name: "switchMap_cancels_inner",
    title: "switchMap: the stale inner is cancelled",
    note: "The same pipeline with switchMap. When the outer delivers 1 at 20ms, the first inner is unsubscribed (cancel) before its second value is due, so the sink only ever sees the newest inner.",
    labels: ["source", "inner", "sink"],
    run(session) {
      const inner = (k) => timer(10, 20).pipe(take(2), map((j) => `${k + 1}.${j + 1}`));
      timer(0, 20)
        .pipe(take(2), trace("source", session), switchMap(traceProjection("inner", session, inner)), trace("sink", session))
        .subscribe();
    },
  },
  {
    name: "concatMap_stall",
    title: "concatMap behind an inner that never completes",
    note: "The outer delivers 0 and 1 and completes. The first inner delivers 1.1 and then never completes, so concatMap never subscribes the second inner: the sink stays open forever. The runtime never shows the queued inner; the spec does, as inner[2] pending.",
    labels: ["source", "inner", "sink"],
    run(session) {
      const inner = (k) => (k === 0 ? concat(of("1.1"), NEVER) : of("2.1"));
      timer(0, 10)
        .pipe(take(2), trace("source", session), concatMap(traceProjection("inner", session, inner)), trace("sink", session))
        .subscribe();
    },
  },
  {
    name: "shareReplay_leak",
    title: "shareReplay(1) keeps the source running after the last subscriber leaves",
    note: "s1 subscribes at 0ms and leaves at 15ms. The source, traced before shareReplay, keeps delivering at 20ms and 30ms with nobody listening: the leak the Share demo finds, SourceStopsWhenUnused violated.",
    labels: ["source", "s1"],
    run(session, scheduler) {
      const shared = timer(10, 10).pipe(take(3), trace("source", session), shareReplay(1));
      const s1 = shared.pipe(trace("s1", session)).subscribe();
      scheduler.schedule(() => s1.unsubscribe(), 15);
    },
  },
  {
    name: "share_resets",
    title: "share(): the source stops with the last subscriber",
    note: "The same scenario with share(). When s1 leaves at 15ms the refCount drops to zero and the source is unsubscribed (cancel): nothing runs unobserved.",
    labels: ["source", "s1"],
    run(session, scheduler) {
      const shared = timer(10, 10).pipe(take(3), trace("source", session), share());
      const s1 = shared.pipe(trace("s1", session)).subscribe();
      scheduler.schedule(() => s1.unsubscribe(), 15);
    },
  },
  {
    name: "combineLatest_silentB",
    title: "combineLatest hangs when source B never delivers",
    note: "A delivers 0 and 1 and completes at 10ms; B never delivers or terminates. The result never emits and never completes: the hanging pipeline the CombineLatest demo finds.",
    labels: ["a", "b", "out"],
    run(session) {
      const a = timer(0, 10).pipe(take(2), trace("a", session));
      const b = NEVER.pipe(trace("b", session));
      combineLatest([a, b]).pipe(trace("out", session)).subscribe();
    },
  },
];

fs.mkdirSync(outDir, { recursive: true });
for (const scenario of scenarios) {
  const scheduler = new TestScheduler(() => {});
  const session = core.createExecutionSession({
    sessionId: scenario.name,
    clock: { now: () => scheduler.now() },
  });
  scheduler.run(() => {
    scenario.run(session, scheduler);
  });
  const exported = session.exportTrace();
  const file = {
    title: scenario.title,
    note: scenario.note,
    labels: scenario.labels,
    ...exported,
  };
  const target = path.join(outDir, `${scenario.name}.json`);
  fs.writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`);
  const lanes = new Set(exported.events.filter((e) => e.subscriptionId).map((e) => e.subscriptionId)).size;
  console.log(`${scenario.name}: ${exported.events.length} events, ${lanes} subscriptions -> ${path.relative(root, target)}`);
}
