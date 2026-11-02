/*
 * SVG elements as plain records, the shape Animation.tla uses:
 *   [name |-> "rect", attrs |-> [x |-> "10", ...], children |-> <<...>>]
 * A View builds a tree of these; `serialize` is SVGElemToString.
 */

export type Attrs = Readonly<Record<string, string | number>>;
export type SvgChild = SvgElem | string;

export interface SvgElem {
  readonly name: string;
  readonly attrs: Attrs;
  readonly children: readonly SvgChild[];
}

export const el = (
  name: string,
  attrs: Attrs = {},
  children: readonly SvgChild[] = [],
): SvgElem => ({ name, attrs, children });

export const group = (
  children: readonly SvgChild[],
  attrs: Attrs = {},
): SvgElem => el("g", attrs, children);

export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  attrs: Attrs = {},
): SvgElem => el("rect", { x, y, width, height, ...attrs });

export const circle = (
  cx: number,
  cy: number,
  r: number,
  attrs: Attrs = {},
): SvgElem => el("circle", { cx, cy, r, ...attrs });

export const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrs: Attrs = {},
): SvgElem => el("line", { x1, y1, x2, y2, ...attrs });

export const text = (
  x: number,
  y: number,
  content: string,
  attrs: Attrs = {},
  extra: readonly SvgChild[] = [],
): SvgElem => el("text", { x, y, ...attrs }, [...extra, content]);

/** A tooltip: `<title>` as the first child of a graphics element. */
export const title = (content: string): SvgElem => el("title", {}, [content]);

export const escapeText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeAttr = (s: string): string =>
  escapeText(s).replace(/"/g, "&quot;");

const num = (v: string | number): string =>
  typeof v === "number" ? String(Math.round(v * 100) / 100) : v;

export function serialize(e: SvgElem): string {
  const attrs = Object.entries(e.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(num(v))}"`)
    .join("");
  const inner = e.children
    .map((c) => (typeof c === "string" ? escapeText(c) : serialize(c)))
    .join("");
  return `<${e.name}${attrs}>${inner}</${e.name}>`;
}
