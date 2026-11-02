/**
 * A TLA+ value as plain JavaScript. Sequences become arrays, records and
 * functions become objects keyed by the formatted domain element, model
 * values become their names, sets become arrays. This module has no
 * dependency on tla-ts, so the core of the package stays browser-safe; the
 * conversion itself lives in tla-values.ts.
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
