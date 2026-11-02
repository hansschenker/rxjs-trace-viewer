import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  constantsOf,
  describeChange,
  startExploration,
  takeChoice,
  toTla,
  toTraceFile,
  undoChoice,
} from "../src/explore.ts";
import { renderTrace } from "../src/render.ts";

const specsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../rxjs-operator-tla/specs",
);
const hasSpecs = fs.existsSync(path.join(specsDir, "manifest.json"));

describe("constantsOf and toTla", () => {
  it("keeps the constants block and finds the model values", () => {
    const { block, modelValues } = constantsOf(
      '\\* demo\nSPECIFICATION Spec\nCONSTANTS\n  Values = {x, y}\n  MaxLen = 2\n  Strategy = "merge"\nPROPERTIES\n  Live\n',
    );
    expect(block).toBe(
      'CONSTANTS\nValues = {x, y}\nMaxLen = 2\nStrategy = "merge"',
    );
    expect([...modelValues]).toEqual(["x", "y"]);
  });

  it("writes values back as TLA+, with model values bare and functions over them", () => {
    const mv = new Set(["s1", "s2", "a"]);
    expect(toTla(["a", "b"], mv)).toBe('<<a, "b">>');
    expect(toTla({ state: "active", sent: 1 }, mv)).toBe(
      '[state |-> "active", sent |-> 1]',
    );
    expect(toTla({ s1: [], s2: ["a"] }, mv)).toBe(
      "(s1 :> <<>> @@ s2 :> <<a>>)",
    );
    expect(toTla(true, mv)).toBe("TRUE");
    expect(toTla([[1, 2]], mv)).toBe("<<<<1, 2>>>>");
  });

  it("describes what a choice changes", () => {
    expect(
      describeChange(
        { out: [], outDone: "active" },
        { out: ["a"], outDone: "active" },
      ),
    ).toBe('out: [] -> ["a"]');
  });
});

describe.skipIf(!hasSpecs)("exploration against the operator specs", () => {
  it("lists the enabled actions of Flatten's initial state and follows a choice", async () => {
    const start = await startExploration(
      specsDir,
      "Flatten_bug_mergeForSwitch.cfg",
    );
    expect(start.steps).toHaveLength(1);
    expect(start.variables).toEqual([
      "outerDone",
      "inner",
      "out",
      "outDone",
      "subscribed",
    ]);
    expect(start.choices.map((c) => c.action).sort()).toEqual([
      "OuterComplete",
      "OuterError",
      "OuterNext",
    ]);

    const i = start.choices.findIndex((c) => c.action === "OuterNext");
    const one = await takeChoice(start, i);
    expect(one.steps[1].state.inner).toEqual([{ state: "active", sent: 0 }]);
    expect(one.choices.map((c) => c.action).sort()).toEqual(
      [
        "InnerComplete",
        "InnerError",
        "InnerNext",
        "OuterComplete",
        "OuterError",
        "OuterNext",
      ].filter((a) => a !== "InnerComplete"),
    );

    const back = await undoChoice(one);
    expect(back.steps).toHaveLength(1);
    expect(back.choices.map((c) => c.action).sort()).toEqual([
      "OuterComplete",
      "OuterError",
      "OuterNext",
    ]);

    const { set, html } = renderTrace(toTraceFile(one));
    expect(set.lanes.map((l) => l.name)).toEqual(["inner[1]", "out"]);
    expect(html).toContain("explored by hand");
  }, 60_000);

  it("handles model values and functions over them", async () => {
    const start = await startExploration(specsDir, "CombineLatest_SilentB.cfg");
    expect(start.choices.map((c) => c.action).sort()).toEqual([
      "AComplete",
      "AError",
      "ANext",
      "ANext",
      "BComplete",
      "BError",
      "BNext",
      "BNext",
    ]);
    const share = await startExploration(specsDir, "Share_leak_demo.cfg");
    expect(share.choices.map((c) => c.action)).toEqual([
      "Subscribe",
      "Subscribe",
      "Subscribe",
    ]);
    const sub = await takeChoice(share, 0);
    expect(
      Object.values(sub.steps[1].state.sub as Record<string, string>),
    ).toContain("on");
  }, 90_000);
});
