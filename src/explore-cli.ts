import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import {
  describeChange,
  startExploration,
  takeChoice,
  toTraceFile,
  undoChoice,
  type Exploration,
} from "./explore.ts";
import { renderTrace } from "./render.ts";
import { traceStem } from "./trace.ts";

/*
 * The terminal picks the action, the browser shows the frames: after every
 * choice the animation page is written again, so reloading it shows the
 * trace explored so far.
 */

export interface ExploreIo {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
}

export async function exploreInteractively(
  specsDir: string,
  cfg: string,
  outDir: string,
  io: ExploreIo = { input: process.stdin, output: process.stdout },
): Promise<Exploration> {
  let x = await startExploration(specsDir, cfg);
  const target = path.join(outDir, `explore-${traceStem(cfg)}.html`);
  const print = (s: string): void => {
    io.output.write(`${s}\n`);
  };
  const write = (): void => {
    fs.mkdirSync(outDir, { recursive: true });
    const { html } = renderTrace(toTraceFile(x), {
      title: `explore ${traceStem(cfg)}`,
    });
    fs.writeFileSync(target, html);
  };
  const rl = readline.createInterface(io);
  write();
  print(
    `${cfg}: exploring by hand. Page: ${target} (reload it after each step)`,
  );
  try {
    for (;;) {
      const last = x.steps[x.steps.length - 1];
      print(`\nstep ${last.index}: ${last.action}`);
      x.choices.forEach((c, i) => {
        print(
          `  [${i + 1}] ${c.action}  ${describeChange(last.state, c.state)}`,
        );
      });
      if (x.choices.length === 0)
        print("  (no enabled action: the trace ends here)");
      const answer = (
        await rl.question("choice number, u = undo, q = quit: ")
      ).trim();
      if (answer === "q") break;
      if (answer === "u") {
        x = await undoChoice(x);
        write();
        continue;
      }
      const n = Number(answer);
      if (!Number.isInteger(n) || n < 1 || n > x.choices.length) {
        print("  not a choice");
        continue;
      }
      x = await takeChoice(x, n - 1);
      write();
    }
  } finally {
    rl.close();
  }
  print(`${x.steps.length} states explored -> ${target}`);
  return x;
}
