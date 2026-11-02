import { describe, expect, it } from "vitest";
import type { Value } from "tla-ts";
import { toJs } from "../src/tla-values.ts";

const fn = (domain: Value[], range: Value[]): Value => ({
  kind: "Function",
  domain,
  range,
  hash: 0,
  fingerprint: 0,
  writtenKeys: undefined,
});
const model = (name: string): Value => ({ kind: "ModelValue", name, type: undefined });

describe("toJs", () => {
  it("keeps scalars", () => {
    expect(toJs(3)).toBe(3);
    expect(toJs("active")).toBe("active");
    expect(toJs(true)).toBe(true);
  });

  it("turns a sequence into an array", () => {
    expect(toJs(fn([1, 2], ["a", "b"]))).toEqual(["a", "b"]);
    expect(toJs(fn([], []))).toEqual([]);
  });

  it("turns a record into an object", () => {
    expect(toJs(fn(["state", "sent"], ["active", 1]))).toEqual({ state: "active", sent: 1 });
  });

  it("turns a model value into its name, also as a function key", () => {
    expect(toJs(model("s1"))).toBe("s1");
    expect(toJs(fn([model("s1"), model("s2")], [fn([], []), fn([1], ["a"])]))).toEqual({
      s1: [],
      s2: ["a"],
    });
  });

  it("turns a set into an array", () => {
    expect(toJs({ kind: "Set", elements: [1, 2], hash: 0, fingerprint: 0 })).toEqual([1, 2]);
  });

  it("turns a tuple of numbers into an array", () => {
    expect(toJs(fn([1, 2], [2, 1]))).toEqual([2, 1]);
  });
});
