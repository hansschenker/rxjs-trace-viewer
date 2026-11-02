import { formatValue, type Value } from "tla-ts";
import type { JsValue } from "./values.ts";

/** Converts a tla-ts value to plain JavaScript; see values.ts for the shape. */
export function toJs(value: Value): JsValue {
  if (typeof value !== "object") return value;
  switch (value.kind) {
    case "ModelValue":
      return value.name;
    case "Function": {
      const { domain, range } = value;
      if (domain.every((d, i) => d === i + 1)) return range.map(toJs);
      const record: Record<string, JsValue> = {};
      domain.forEach((d, i) => {
        record[keyOf(d)] = toJs(range[i]);
      });
      return record;
    }
    case "Set":
    case "MixedSet":
      return value.elements.map(toJs);
    case "Interval":
      return Array.from(
        { length: value.high - value.low + 1 },
        (_, i) => value.low + i,
      );
    default:
      return formatValue(value);
  }
}

function keyOf(value: Value): string {
  const js = toJs(value);
  return typeof js === "string" ? js : JSON.stringify(js);
}
