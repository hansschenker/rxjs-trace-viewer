import type { SvgElem } from "./svg.ts";

/*
 * SvgElem records as real DOM nodes: the counterpart of `serialize` for a
 * page that renders frames on demand instead of pasting strings.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const attr = (v: string | number): string =>
  typeof v === "number" ? String(Math.round(v * 100) / 100) : v;

export function toDom(elem: SvgElem, doc: Document): SVGElement {
  const node = doc.createElementNS(SVG_NS, elem.name);
  for (const [name, value] of Object.entries(elem.attrs)) {
    node.setAttribute(name, attr(value));
  }
  for (const child of elem.children) {
    node.append(
      typeof child === "string" ? doc.createTextNode(child) : toDom(child, doc),
    );
  }
  return node;
}

/** Replaces the children of `svg` with the rendered element. */
export function mountSvg(svg: SVGSVGElement, elem: SvgElem): void {
  svg.replaceChildren(toDom(elem, svg.ownerDocument));
}
