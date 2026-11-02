import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMOS, parseArgs } from "../src/cli-args.ts";

const base = path.resolve("/repo");

describe("parseArgs", () => {
  it("defaults to animating the four demos from the sibling specs", () => {
    const o = parseArgs([], base);
    expect(o.command).toBe("animate");
    expect(o.cfgs).toEqual(DEMOS);
    expect(o.specs).toBe(path.resolve(base, "../rxjs-operator-tla/specs"));
    expect(o.traces).toBe(path.resolve(base, "traces"));
    expect(o.out).toBe(path.resolve(base, "out"));
  });

  it("takes a command, configs and directory options in any order", () => {
    const o = parseArgs(
      [
        "--out",
        "pages",
        "render",
        "Take.cfg",
        "--specs",
        "/specs",
        "Share.cfg",
      ],
      base,
    );
    expect(o.command).toBe("render");
    expect(o.cfgs).toEqual(["Take.cfg", "Share.cfg"]);
    expect(o.specs).toBe(path.resolve("/specs"));
    expect(o.out).toBe(path.resolve(base, "pages"));
  });

  it("rejects an option without a value", () => {
    expect(() => parseArgs(["trace", "--specs"], base)).toThrow(
      "--specs needs a value",
    );
  });
});
