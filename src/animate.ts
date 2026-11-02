import { escapeText, serialize, type SvgElem } from "./svg.ts";

/*
 * The playback page, after template.html of the Animation module: every
 * frame is a top-level <g> inside one <svg>, and the page shows one at a
 * time. Prev / Next, the arrow keys, Home / End, a slider, Play, and the
 * step list all set the current frame. No library. An animation is a
 * self-contained `.anim` fragment, so a gallery can hold several.
 */

export interface AnimationPage {
  readonly title: string;
  readonly subtitle: string;
  readonly note: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly SvgElem[];
  readonly steps: readonly string[];
  readonly loopStart: number | null;
}

export interface GalleryItem {
  /** Unique within the gallery; used for the tab and the fragment. */
  readonly id: string;
  /** Tabs are grouped under this heading, in order of first appearance. */
  readonly group?: string;
  readonly page: AnimationPage;
}

export interface GalleryPage {
  readonly title: string;
  readonly intro?: string;
  readonly items: readonly GalleryItem[];
}

const MONO = '"JetBrains Mono", Consolas, Menlo, monospace';

/** Styles for `.anim` and `.gallery`; light and dark, by the viewer's choice or the OS. */
export const ANIMATION_CSS = `
  :root { color-scheme: light dark; --anim-bg: #FBF8F9; --anim-ink: #231A1E; --anim-muted: #6E5E66; --anim-rule: #E6DADF; --anim-accent: #C2185B; --anim-surface: #FFFFFF; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --anim-bg: #17121A; --anim-ink: #EFE7EB; --anim-muted: #A8979F; --anim-rule: #3A3038; --anim-accent: #F06292; --anim-surface: #1F191F; } }
  :root[data-theme="dark"] { --anim-bg: #17121A; --anim-ink: #EFE7EB; --anim-muted: #A8979F; --anim-rule: #3A3038; --anim-accent: #F06292; --anim-surface: #1F191F; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--anim-bg); color: var(--anim-ink); font-family: system-ui, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; }
  .page { max-width: 1240px; margin: 0 auto; padding: 28px 24px 64px; }
  .page > h1, .anim-title { font-size: 22px; margin: 0 0 4px; font-family: ${MONO}; }
  .sub, .note, .loop, .anim-sub, .anim-note, .anim-loop, .gallery-intro { margin: 0 0 6px; color: var(--anim-muted); }
  .loop, .anim-loop { color: var(--anim-accent); }
  .anim { margin-top: 8px; }
  .anim-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 18px 0 12px; }
  .anim button, .gallery-tab { font: inherit; color: var(--anim-ink); background: var(--anim-surface); border: 1px solid var(--anim-rule); border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  .anim button:hover, .gallery-tab:hover { border-color: var(--anim-accent); }
  .anim button:focus-visible, .gallery-tab:focus-visible { outline: 2px solid var(--anim-accent); outline-offset: 2px; }
  .anim-slider { width: min(360px, 100%); accent-color: var(--anim-accent); }
  .anim-counter { font-family: ${MONO}; font-size: 14px; min-width: 12ch; }
  .anim-action { font-family: ${MONO}; font-size: 15px; font-weight: 600; color: var(--anim-accent); }
  .anim-stage-wrap { border: 1px solid var(--anim-rule); background: var(--anim-surface); padding: 8px; overflow-x: auto; }
  .anim-stage { display: block; width: 100%; height: auto; max-width: 100%; color: var(--anim-ink); }
  .anim-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; align-items: start; }
  @media (max-width: 900px) { .anim-layout { grid-template-columns: 1fr; } }
  .anim-steps { margin: 0; padding: 0; list-style: none; max-height: 70vh; overflow-y: auto; border: 1px solid var(--anim-rule); background: var(--anim-surface); }
  .anim-steps li { border-bottom: 1px solid var(--anim-rule); }
  .anim-steps button { display: flex; gap: 10px; width: 100%; text-align: left; border: 0; border-radius: 0; background: none; padding: 6px 10px; font-family: ${MONO}; font-size: 13px; }
  .anim-steps button .n { color: var(--anim-muted); min-width: 2.5ch; text-align: right; }
  .anim-steps button.current { background: var(--anim-accent); color: #fff; }
  .anim-steps button.current .n { color: #fff; opacity: 0.85; }
  .anim kbd { font-family: inherit; border: 1px solid var(--anim-rule); border-radius: 3px; padding: 0 5px; font-size: 12px; }
  .anim-help { color: var(--anim-muted); font-size: 13px; }
  .gallery-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 18px 0 8px; padding-bottom: 14px; border-bottom: 1px solid var(--anim-rule); }
  .gallery-group { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--anim-muted); margin-left: 8px; }
  .gallery-group:first-child { margin-left: 0; }
  .gallery-tab.current { background: var(--anim-accent); border-color: var(--anim-accent); color: #fff; }
`;

/** Runs every `.anim` and `[data-gallery]` on the page. Include once per page. */
export const ANIMATION_SCRIPT = `
(() => {
  const init = (root) => {
    const data = JSON.parse(root.querySelector("script.anim-data").textContent);
    const STEPS = data.steps;
    const frames = Array.from(root.querySelectorAll("svg.anim-stage > g.frame"));
    const items = Array.from(root.querySelectorAll(".anim-steps button"));
    const q = (c) => root.querySelector(c);
    const slider = q(".anim-slider");
    const counter = q(".anim-counter");
    const action = q(".anim-action");
    const play = q(".anim-play");
    let i = 0;
    let timer = null;
    const show = (n) => {
      i = Math.min(Math.max(n, 0), frames.length - 1);
      frames.forEach((g, k) => g.setAttribute("visibility", k === i ? "visible" : "hidden"));
      items.forEach((b, k) => b.classList.toggle("current", k === i));
      slider.value = String(i);
      counter.textContent = "frame " + i + " of " + (frames.length - 1);
      action.textContent = STEPS[i];
      const cur = items[i];
      if (cur) cur.scrollIntoView({ block: "nearest" });
    };
    const step = (d) => show((i + d + frames.length) % frames.length);
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; play.textContent = "Play"; } };
    const toggle = () => {
      if (timer !== null) return stop();
      play.textContent = "Pause";
      timer = setInterval(() => { if (i === frames.length - 1) stop(); else step(1); }, 700);
    };
    q(".anim-prev").addEventListener("click", () => { stop(); step(-1); });
    q(".anim-next").addEventListener("click", () => { stop(); step(1); });
    play.addEventListener("click", toggle);
    slider.addEventListener("input", () => { stop(); show(Number(slider.value)); });
    items.forEach((b, k) => b.addEventListener("click", () => { stop(); show(k); }));
    const visible = () => !root.hidden && root.closest("[hidden]") === null;
    document.addEventListener("keydown", (e) => {
      if (!visible() || e.target === slider) return;
      if (e.key === "ArrowRight") { stop(); step(1); }
      else if (e.key === "ArrowLeft") { stop(); step(-1); }
      else if (e.key === "Home") { stop(); show(0); }
      else if (e.key === "End") { stop(); show(frames.length - 1); }
      else if (e.key === " ") { toggle(); }
      else return;
      e.preventDefault();
    });
    show(0);
  };
  document.querySelectorAll(".anim").forEach(init);
  document.querySelectorAll("[data-gallery]").forEach((gallery) => {
    const tabs = Array.from(gallery.querySelectorAll(".gallery-tab"));
    const panels = Array.from(gallery.querySelectorAll(".anim"));
    const select = (id) => {
      tabs.forEach((t) => t.classList.toggle("current", t.dataset.target === id));
      panels.forEach((p) => { p.hidden = p.dataset.anim !== id; });
    };
    tabs.forEach((t) => t.addEventListener("click", () => select(t.dataset.target)));
    if (tabs.length > 0) select(tabs[0].dataset.target);
  });
})();
`;

export interface FragmentOptions {
  /** Put the page's title, subtitle and notes inside the fragment. */
  readonly heading?: boolean;
}

/** One animation: controls, stage and step list, scoped to a `.anim` container. */
export function renderAnimationFragment(
  p: AnimationPage,
  id: string,
  options: FragmentOptions = {},
): string {
  const data = JSON.stringify({ steps: p.steps }).replace(/</g, "\\u003c");
  const stepItems = p.steps
    .map(
      (action, i) =>
        `<li><button type="button" data-step="${i}"><span class="n">${i}</span>${escapeText(action)}</button></li>`,
    )
    .join("\n      ");
  const heading =
    options.heading === true
      ? `<div class="anim-head"><h2 class="anim-title">${escapeText(p.title)}</h2><p class="anim-sub">${escapeText(p.subtitle)}</p>${noteOf(p, "anim-note")}${loopOf(p, "anim-loop")}</div>\n  `
      : "";
  return `<section class="anim" data-anim="${escapeText(id)}">
  ${heading}<div class="anim-controls">
    <button type="button" class="anim-prev">Prev</button>
    <button type="button" class="anim-next">Next</button>
    <button type="button" class="anim-play">Play</button>
    <input type="range" class="anim-slider" min="0" max="${p.frames.length - 1}" value="0" aria-label="frame">
    <span class="anim-counter"></span>
    <span class="anim-action"></span>
    <span class="anim-help"><kbd>←</kbd> <kbd>→</kbd> step · <kbd>Home</kbd> <kbd>End</kbd> · <kbd>Space</kbd> play</span>
  </div>
  <div class="anim-layout">
    <div class="anim-stage-wrap">
      <svg class="anim-stage" viewBox="0 0 ${p.width} ${p.height}" xmlns="http://www.w3.org/2000/svg">
${p.frames.map(serialize).join("\n")}
      </svg>
    </div>
    <ol class="anim-steps">
      ${stepItems}
    </ol>
  </div>
  <script type="application/json" class="anim-data">${data}</script>
</section>`;
}

const noteOf = (p: AnimationPage, cls: string): string =>
  p.note === undefined ? "" : `<p class="${cls}">${escapeText(p.note)}</p>`;

const loopOf = (p: AnimationPage, cls: string): string =>
  p.loopStart === null
    ? ""
    : `<p class="${cls}">Liveness violation: after the last frame the trace loops back to frame ${p.loopStart} forever.</p>`;

const htmlDocument = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<style>${ANIMATION_CSS}</style>
</head>
<body>
${body}
<script>${ANIMATION_SCRIPT}</script>
</body>
</html>
`;

/** A standalone page with one animation. */
export function renderAnimationHtml(p: AnimationPage): string {
  const body = `<div class="page">
  <h1>${escapeText(p.title)}</h1>
  <p class="sub">${escapeText(p.subtitle)}</p>
  ${noteOf(p, "note")}
  ${loopOf(p, "loop")}
  ${renderAnimationFragment(p, "main")}
</div>`;
  return htmlDocument(p.title, body);
}

/** The gallery's body: tabs and one `.anim` per item. */
function galleryBody(g: GalleryPage): string {
  const groups: string[] = [];
  for (const item of g.items) {
    const name = item.group ?? "";
    if (!groups.includes(name)) groups.push(name);
  }
  const tabs = groups
    .map((name) => {
      const label =
        name === ""
          ? ""
          : `<span class="gallery-group">${escapeText(name)}</span>\n    `;
      const buttons = g.items
        .filter((it) => (it.group ?? "") === name)
        .map(
          (it) =>
            `<button type="button" class="gallery-tab" data-target="${escapeText(it.id)}">${escapeText(it.page.title)}</button>`,
        )
        .join("\n    ");
      return `${label}${buttons}`;
    })
    .join("\n    ");
  const intro =
    g.intro === undefined
      ? ""
      : `<p class="gallery-intro">${escapeText(g.intro)}</p>`;
  const panels = g.items
    .map((it) => renderAnimationFragment(it.page, it.id, { heading: true }))
    .join("\n");
  return `<div class="page gallery" data-gallery>
  <h1>${escapeText(g.title)}</h1>
  ${intro}
  <nav class="gallery-tabs" aria-label="animations">
    ${tabs}
  </nav>
${panels}
</div>`;
}

/** The gallery as a body fragment with its own title and style: for a host that wraps pages. */
export function renderGalleryFragment(g: GalleryPage): string {
  return `<title>${escapeText(g.title)}</title>
<style>${ANIMATION_CSS}</style>
${galleryBody(g)}
<script>${ANIMATION_SCRIPT}</script>
`;
}

/** The gallery as a standalone page. */
export function renderGalleryHtml(g: GalleryPage): string {
  return htmlDocument(g.title, galleryBody(g));
}
