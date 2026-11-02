import type { FrameSet } from "./frames.ts";
import {
  circle,
  el,
  group,
  line,
  rect,
  text,
  title,
  type Attrs,
  type SvgElem,
} from "./svg.ts";
import { isJsArray, type JsRecord, type JsValue } from "./values.ts";

/*
 * The View: a pure function from a frame to an SVG element tree, like the
 * View expression of Animation.tla. The layout is generic: one lane per
 * stream, tracked item or subscription on a shared time axis, marbles
 * where values were delivered, state pills where an item changed, and a
 * panel that prints the remaining variables verbatim.
 */

export type MarkKind =
  "value" | "complete" | "error" | "subscribe" | "unsubscribe" | "state";

export interface Mark {
  readonly lane: string;
  readonly step: number;
  readonly column: number;
  readonly kind: MarkKind;
  readonly label: string;
  readonly detail: string;
}

export interface Timeline {
  readonly lanes: readonly string[];
  readonly marks: readonly Mark[];
  readonly lastColumn: number;
}

const same = (a: JsValue, b: JsValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** What changed in a tracked item: its new state, or the fields that moved. */
function itemLabel(before: JsRecord | null, after: JsRecord): string {
  const state = after.state;
  if (before === null) return typeof state === "string" ? state : "new";
  const changed = Object.keys(after).filter(
    (k) => !(k in before) || !same(before[k], after[k]),
  );
  if (changed.includes("state") && typeof state === "string") return state;
  return changed.map((k) => `${k}=${shortLabel(after[k])}`).join(" ");
}

/** Every delivery, lifecycle change and item change in the trace, with its step. */
export function buildTimeline(set: FrameSet): Timeline {
  const marks: Mark[] = [];
  const push = (
    lane: string,
    step: number,
    column: number,
    kind: MarkKind,
    label: string,
    detail: string,
  ): void => {
    marks.push({ lane, step, column, kind, label, detail });
  };
  for (let i = 1; i < set.frames.length; i++) {
    const prev = set.frames[i - 1];
    const cur = set.frames[i];
    const column = cur.column;
    for (const { name, kind } of set.lanes) {
      if (kind === "stream") {
        const a = prev.streams[name];
        const b = cur.streams[name];
        for (let j = a.vals.length; j < b.vals.length; j++) {
          push(
            name,
            i,
            column,
            "value",
            shortLabel(b.vals[j]),
            formatTla(b.vals[j]),
          );
        }
        if (a.status === "active" && b.status !== "active") {
          push(name, i, column, b.status, b.status, b.status);
        }
      }
      if (kind === "item") {
        const a = prev.items[name] ?? null;
        const b = cur.items[name] ?? null;
        if (b !== null && (a === null || !same(a, b))) {
          push(name, i, column, "state", itemLabel(a, b), formatTla(b));
        }
      }
      const sa = prev.subs[name];
      const sb = cur.subs[name];
      if (sa === undefined || sb === undefined || sa === sb) continue;
      if (sb === "on") push(name, i, column, "subscribe", "^", "subscribe");
      else if (sb === "off")
        push(name, i, column, "unsubscribe", "!", "unsubscribe");
      else if (kind === "sub" && (sb === "complete" || sb === "error")) {
        push(name, i, column, sb, sb, sb);
      }
    }
  }
  const lastColumn = Math.max(0, ...set.frames.map((f) => f.column));
  return { lanes: set.lanes.map((l) => l.name), marks, lastColumn };
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly colW: number;
  readonly r: number;
  readonly laneH: number;
  readonly laneY0: number;
  readonly panelX: number;
  readonly panelW: number;
}

const pillWidth = (label: string): number => label.length * 6.3 + 12;
const columnLabel = (set: FrameSet, c: number): string =>
  set.columnLabels?.[c] ?? (set.hasTime ? `t${c}` : String(c));

/** One layout for the whole trace, so every frame shares a viewBox. */
export function layoutFor(set: FrameSet, tl: Timeline): Layout {
  const nCols = tl.lastColumn + 1;
  const widestPill = Math.max(
    0,
    ...tl.marks
      .filter((m) => m.kind === "state")
      .map((m) => pillWidth(m.label)),
  );
  const widestLabel = Math.max(
    0,
    ...Array.from(
      { length: nCols },
      (_, c) => columnLabel(set, c).length * 6.3 + 8,
    ),
  );
  const colW = Math.max(
    34,
    Math.min(84, Math.floor(600 / nCols)),
    widestPill + 8,
    widestLabel,
  );
  const r = Math.min(12, Math.max(8, Math.floor(colW * 0.36)));
  const nameLen = Math.max(4, ...tl.lanes.map((l) => l.length));
  const x0 = 20 + Math.min(220, 20 + nameLen * 7.5);
  const laneH = 44;
  const laneY0 = 96;
  const lanesH = Math.max(1, tl.lanes.length) * laneH;
  const internalsCount = Math.max(
    0,
    ...set.frames.map((f) => Object.keys(f.internals).length),
  );
  const panelW = internalsCount > 0 ? 300 : 0;
  const panelX = x0 + nCols * colW + 28;
  const panelH = internalsCount > 0 ? 30 + internalsCount * 18 : 0;
  const bodyBottom = Math.max(laneY0 + lanesH, laneY0 - 36 + panelH + 10);
  const height = bodyBottom + (set.loopStart !== null ? 30 : 10) + 36;
  return {
    width: panelX + panelW + 20,
    height,
    x0,
    colW,
    r,
    laneH,
    laneY0,
    panelX,
    panelW,
  };
}

export const ACCENT = "#C2185B";
export const MODEL = "#2E6F8E";
export const ERROR = "#D64545";
const MONO = "JetBrains Mono, Consolas, Menlo, monospace";
const mono: Attrs = { "font-family": MONO, "font-size": 12 };

/** Renders frame `i` of the set as a `<g class="frame">`. */
export function renderFrame(
  set: FrameSet,
  tl: Timeline,
  L: Layout,
  i: number,
): SvgElem {
  const frame = set.frames[i];
  const prev = i > 0 ? set.frames[i - 1] : undefined;
  const last = set.frames.length - 1;
  const lanesH = tl.lanes.length * L.laneH;
  const colX = (c: number): number => L.x0 + c * L.colW + L.colW / 2;
  const out: SvgElem[] = [];

  out.push(
    text(20, 30, `frame ${i} / ${last}   ·   ${frame.action}`, {
      ...mono,
      "font-size": 13,
      "font-weight": 600,
    }),
  );

  out.push(
    rect(L.x0 + frame.column * L.colW, L.laneY0 - 36, L.colW, lanesH + 14, {
      fill: ACCENT,
      "fill-opacity": 0.08,
    }),
  );
  const axis = set.axisLabel ?? (set.hasTime ? "now" : "step");
  out.push(
    text(L.x0 - 8, L.laneY0 - 24, axis, {
      ...mono,
      "font-size": 10.5,
      "text-anchor": "end",
      opacity: 0.55,
    }),
  );
  for (let c = 0; c <= tl.lastColumn; c++) {
    out.push(
      text(colX(c), L.laneY0 - 24, columnLabel(set, c), {
        ...mono,
        "font-size": 10.5,
        "text-anchor": "middle",
        opacity: 0.7,
      }),
    );
    out.push(
      line(colX(c), L.laneY0 - 14, colX(c), L.laneY0 + lanesH - 22, {
        stroke: "currentColor",
        "stroke-width": 1,
        opacity: 0.15,
      }),
    );
  }

  if (set.loopStart !== null) {
    const c0 = set.frames[set.loopStart].column;
    const y = L.laneY0 + lanesH - 10;
    const xEnd = L.x0 + (tl.lastColumn + 1) * L.colW;
    out.push(
      el("path", {
        d: `M${colX(c0)},${y} V${y + 8} H${xEnd} V${y}`,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.2,
      }),
    );
    const loopText =
      set.loopStart === last
        ? `↺ liveness: the trace stays in frame ${last} forever`
        : `↺ liveness: after frame ${last} the trace loops back to frame ${set.loopStart}`;
    out.push(
      text(L.x0, y + 24, loopText, {
        ...mono,
        "font-size": 10.5,
        opacity: 0.8,
      }),
    );
  }

  const visible = groupMarks(tl.marks.filter((m) => m.step <= i));
  tl.lanes.forEach((lane, k) => {
    const y = L.laneY0 + k * L.laneH;
    out.push(text(20, y + 4, lane, mono));
    out.push(
      line(L.x0, y, L.x0 + (tl.lastColumn + 1) * L.colW, y, {
        stroke: "currentColor",
        "stroke-width": 1.4,
      }),
    );
    for (const [column, marks] of visible.get(lane) ?? []) {
      const spread = Math.min(L.colW / marks.length, L.r * 2 + 6);
      marks.forEach((m, j) => {
        const x = colX(column) + (j - (marks.length - 1) / 2) * spread;
        out.push(markElem(m, x, y, L.r, m.step === i));
      });
    }
  });

  const entries = Object.entries(frame.internals);
  if (entries.length > 0) {
    const px = L.panelX;
    const py = L.laneY0 - 36;
    const maxChars = Math.floor((L.panelW - 24) / 7.2);
    out.push(
      rect(px, py, L.panelW, 30 + entries.length * 18, {
        fill: "none",
        stroke: MODEL,
        "stroke-width": 1.4,
        rx: 3,
      }),
    );
    out.push(
      text(px + 12, py + 20, "VARIABLES", {
        ...mono,
        "font-size": 10.5,
        "font-weight": 600,
        fill: MODEL,
        "letter-spacing": 1,
      }),
    );
    entries.forEach(([name, value], j) => {
      const full = `${name} = ${formatTla(value)}`;
      const before = prev === undefined ? undefined : prev.internals[name];
      const changed =
        prev !== undefined && (before === undefined || !same(before, value));
      const attrs: Attrs = changed
        ? { ...mono, "font-size": 11.5, fill: ACCENT, "font-weight": 600 }
        : { ...mono, "font-size": 11.5 };
      out.push(
        text(px + 12, py + 40 + j * 18, truncate(full, maxChars), attrs, [
          title(full),
        ]),
      );
    });
  }

  out.push(
    text(
      20,
      L.height - 14,
      "^ subscribe · ! unsubscribe · | complete · # error · pill = item state · ring = changed in this step",
      { ...mono, "font-size": 10.5, opacity: 0.65 },
    ),
  );

  return group(out, {
    class: "frame",
    id: `frame-${i}`,
    "data-step": i,
    "data-action": frame.action,
    visibility: i === 0 ? "visible" : "hidden",
  });
}

function groupMarks(marks: readonly Mark[]): Map<string, Map<number, Mark[]>> {
  const byLane = new Map<string, Map<number, Mark[]>>();
  for (const m of marks) {
    const byColumn = byLane.get(m.lane) ?? new Map<number, Mark[]>();
    const list = byColumn.get(m.column) ?? [];
    list.push(m);
    byColumn.set(m.column, list);
    byLane.set(m.lane, byColumn);
  }
  return byLane;
}

function markElem(
  m: Mark,
  x: number,
  y: number,
  r: number,
  fresh: boolean,
): SvgElem {
  const parts: SvgElem[] = [title(`step ${m.step}: ${m.detail}`)];
  const ring = (): SvgElem =>
    circle(x, y, r + 4, {
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      opacity: 0.8,
    });
  const glyph = (s: string, attrs: Attrs = {}): SvgElem =>
    text(x, y + 5, s, {
      ...mono,
      "font-size": 15,
      "font-weight": 700,
      "text-anchor": "middle",
      ...attrs,
    });
  switch (m.kind) {
    case "value": {
      if (fresh) parts.push(ring());
      const shown = m.label.length <= 5 ? m.label : `${m.label.slice(0, 4)}…`;
      const size = shown.length <= 2 ? 11 : shown.length <= 3 ? 9.5 : 8;
      parts.push(circle(x, y, r, { fill: ACCENT }));
      parts.push(
        text(x, y + size * 0.36, shown, {
          ...mono,
          "font-size": size,
          "font-weight": 500,
          "text-anchor": "middle",
          fill: "#FFFFFF",
        }),
      );
      break;
    }
    case "state": {
      const w = pillWidth(m.label);
      if (fresh) {
        parts.push(
          rect(x - w / 2 - 3, y - 12, w + 6, 24, {
            rx: 12,
            fill: "none",
            stroke: "currentColor",
            "stroke-width": 1.5,
            opacity: 0.8,
          }),
        );
      }
      parts.push(rect(x - w / 2, y - 9, w, 18, { rx: 9, fill: MODEL }));
      parts.push(
        text(x, y + 3.5, m.label, {
          ...mono,
          "font-size": 10,
          "font-weight": 500,
          "text-anchor": "middle",
          fill: "#FFFFFF",
        }),
      );
      break;
    }
    case "complete":
      if (fresh) parts.push(ring());
      parts.push(rect(x - 1.5, y - r, 3, 2 * r, { fill: "currentColor" }));
      break;
    case "error":
      if (fresh) parts.push(ring());
      parts.push(glyph("#", { fill: ERROR }));
      break;
    case "subscribe":
      if (fresh) parts.push(ring());
      parts.push(glyph("^", { "font-size": 20 }));
      break;
    case "unsubscribe":
      if (fresh) parts.push(ring());
      parts.push(glyph("!", { "font-size": 18 }));
      break;
  }
  return group(parts, { class: `mark ${m.kind}` });
}

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`;

/** A marble label: short, with the full value in the tooltip. */
export function shortLabel(v: JsValue): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "T" : "F";
  if (isJsArray(v)) return v.map(shortLabel).join(",");
  return JSON.stringify(v);
}

/** TLA+-style formatting for the internals panel and tooltips. */
export function formatTla(v: JsValue): string {
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (isJsArray(v)) return `<<${v.map(formatTla).join(", ")}>>`;
  return `[${Object.entries(v)
    .map(([k, x]) => `${k} |-> ${formatTla(x)}`)
    .join(", ")}]`;
}
