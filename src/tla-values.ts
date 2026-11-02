import { formatValue, type Value } from "tla-ts";

/**
 * A TLA+ value as plain JavaScript. Sequences become arrays, records and
 * functions become objects keyed by the formatted domain element, model
 * values become their names, sets become arrays. Anything else is kept as
 * tla-ts formats it.
 */
export type JsValue =
  | string
  | number
  | boolean
  | readonly JsValue[]
  | { readonly [key: string]: JsValue };

export type JsRecord = { readonly [key: string]: JsValue };

export const isJsArray = (v: JsValue | undefined): v is readonly JsValue[] =>
  Array.isArray(v);

export const isJsRecord = (v: JsValue | undefined): v is JsRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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
