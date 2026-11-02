import { escapeText, serialize, type SvgElem } from "./svg.ts";

/*
 * The playback page, after template.html of the Animation module: every
 * frame is a top-level <g> inside one <svg>, and the page shows one at a
 * time. Prev / Next, the arrow keys, Home / End, a slider, Play, and the
 * step list all set the current frame. No library.
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

export function renderAnimationHtml(p: AnimationPage): string {
  const stepsJson = JSON.stringify(p.steps).replace(/</g, "\\u003c");
  const stepItems = p.steps
    .map(
      (action, i) =>
        `<li><button type="button" data-step="${i}"><span class="n">${i}</span>${escapeText(action)}</button></li>`,
    )
    .join("\n        ");
  const loopNote =
    p.loopStart === null
      ? ""
      : `<p class="loop">Liveness violation: after the last frame the trace loops back to frame ${p.loopStart} forever.</p>`;
  const note =
    p.note === undefined ? "" : `<p class="note">${escapeText(p.note)}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(p.title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #FBF8F9; --ink: #231A1E; --muted: #6E5E66; --rule: #E6DADF; --accent: #C2185B; --surface: #FFFFFF; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17121A; --ink: #EFE7EB; --muted: #A8979F; --rule: #3A3038; --accent: #F06292; --surface: #1F191F; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; }
  .page { max-width: 1240px; margin: 0 auto; padding: 28px 24px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; font-family: "JetBrains Mono", Consolas, Menlo, monospace; }
  .sub, .note, .loop { margin: 0 0 6px; color: var(--muted); }
  .loop { color: var(--accent); }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 18px 0 12px; }
  button { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  input[type=range] { width: min(360px, 100%); accent-color: var(--accent); }
  .counter { font-family: "JetBrains Mono", Consolas, Menlo, monospace; font-size: 14px; min-width: 12ch; }
  .action { font-family: "JetBrains Mono", Consolas, Menlo, monospace; font-size: 15px; font-weight: 600; color: var(--accent); }
  .stage-wrap { border: 1px solid var(--rule); background: var(--surface); padding: 8px; overflow-x: auto; }
  svg#stage { display: block; width: 100%; height: auto; max-width: 100%; color: var(--ink); }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 20px; align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  .steps { margin: 0; padding: 0; list-style: none; max-height: 70vh; overflow-y: auto; border: 1px solid var(--rule); background: var(--surface); }
  .steps li { border-bottom: 1px solid var(--rule); }
  .steps button { display: flex; gap: 10px; width: 100%; text-align: left; border: 0; border-radius: 0; background: none; padding: 6px 10px; font-family: "JetBrains Mono", Consolas, Menlo, monospace; font-size: 13px; }
  .steps button .n { color: var(--muted); min-width: 2.5ch; text-align: right; }
  .steps button.current { background: var(--accent); color: #fff; }
  .steps button.current .n { color: #fff; opacity: 0.85; }
  kbd { font-family: inherit; border: 1px solid var(--rule); border-radius: 3px; padding: 0 5px; font-size: 12px; }
  .help { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<div class="page">
  <h1>${escapeText(p.title)}</h1>
  <p class="sub">${escapeText(p.subtitle)}</p>
  ${note}
  ${loopNote}
  <div class="controls">
    <button type="button" id="prev">Prev</button>
    <button type="button" id="next">Next</button>
    <button type="button" id="play">Play</button>
    <input type="range" id="slider" min="0" max="${p.frames.length - 1}" value="0" aria-label="frame">
    <span class="counter" id="counter"></span>
    <span class="action" id="action"></span>
    <span class="help"><kbd>←</kbd> <kbd>→</kbd> step · <kbd>Home</kbd> <kbd>End</kbd> · <kbd>Space</kbd> play</span>
  </div>
  <div class="layout">
    <div class="stage-wrap">
      <svg id="stage" viewBox="0 0 ${p.width} ${p.height}" xmlns="http://www.w3.org/2000/svg">
${p.frames.map(serialize).join("\n")}
      </svg>
    </div>
    <ol class="steps" id="steps">
        ${stepItems}
    </ol>
  </div>
</div>
<script>
(() => {
  const STEPS = ${stepsJson};
  const frames = Array.from(document.querySelectorAll("#stage > g.frame"));
  const items = Array.from(document.querySelectorAll("#steps button"));
  const slider = document.getElementById("slider");
  const counter = document.getElementById("counter");
  const action = document.getElementById("action");
  const play = document.getElementById("play");
  let i = 0;
  let timer = null;
  function show(n) {
    i = Math.min(Math.max(n, 0), frames.length - 1);
    frames.forEach((g, k) => g.setAttribute("visibility", k === i ? "visible" : "hidden"));
    items.forEach((b, k) => b.classList.toggle("current", k === i));
    slider.value = String(i);
    counter.textContent = "frame " + i + " of " + (frames.length - 1);
    action.textContent = STEPS[i];
    const cur = items[i];
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }
  const step = (d) => show((i + d + frames.length) % frames.length);
  function stop() { if (timer !== null) { clearInterval(timer); timer = null; play.textContent = "Play"; } }
  function toggle() {
    if (timer !== null) return stop();
    play.textContent = "Pause";
    timer = setInterval(() => { if (i === frames.length - 1) stop(); else step(1); }, 700);
  }
  document.getElementById("prev").addEventListener("click", () => { stop(); step(-1); });
  document.getElementById("next").addEventListener("click", () => { stop(); step(1); });
  play.addEventListener("click", toggle);
  slider.addEventListener("input", () => { stop(); show(Number(slider.value)); });
  items.forEach((b, k) => b.addEventListener("click", () => { stop(); show(k); }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { stop(); step(1); }
    else if (e.key === "ArrowLeft") { stop(); step(-1); }
    else if (e.key === "Home") { stop(); show(0); }
    else if (e.key === "End") { stop(); show(frames.length - 1); }
    else if (e.key === " ") { toggle(); }
    else return;
    e.preventDefault();
  });
  show(0);
})();
</script>
</body>
</html>
`;
}
