import type { AnimationPage, FragmentOptions } from "./animate.ts";
import { escapeText, serialize } from "./svg.ts";

/*
 * A paired panel for the static gallery: the model's frames and the
 * runtime's frames both pre-rendered, one player over the runtime, and the
 * model frame chosen by the alignment (see pair.ts) in the page script.
 */

export interface PairPanel {
  readonly model: AnimationPage;
  /** For each runtime frame, the model frame to show beside it. */
  readonly alignment: readonly number[];
}

export function renderPairFragment(
  p: AnimationPage,
  pair: PairPanel,
  id: string,
  options: FragmentOptions = {},
): string {
  const data = JSON.stringify({
    steps: p.steps,
    alignment: pair.alignment,
    modelSteps: pair.model.steps,
  }).replace(/</g, "\\u003c");
  const stepItems = p.steps
    .map(
      (action, i) =>
        `<li><button type="button" data-step="${i}"><span class="n">${i}</span>${escapeText(action)}</button></li>`,
    )
    .join("\n      ");
  const note =
    p.note === undefined
      ? ""
      : `<p class="anim-note">${escapeText(p.note)}</p>`;
  const heading =
    options.heading === true
      ? `<div class="anim-head"><h2 class="anim-title">${escapeText(p.title)}</h2><p class="anim-sub">${escapeText(p.subtitle)}</p>${note}</div>\n  `
      : "";
  const stage = (page: AnimationPage, cls: string): string =>
    `<svg class="anim-stage${cls}" viewBox="0 0 ${page.width} ${page.height}" xmlns="http://www.w3.org/2000/svg">\n${page.frames.map(serialize).join("\n")}\n</svg>`;
  return `<section class="anim anim-pair" data-anim="${escapeText(id)}">
  ${heading}<div class="anim-controls">
    <button type="button" class="anim-prev">Prev</button>
    <button type="button" class="anim-next">Next</button>
    <button type="button" class="anim-play">Play</button>
    <input type="range" class="anim-slider" min="0" max="${p.frames.length - 1}" value="0" aria-label="frame">
    <span class="anim-counter"></span>
    <span class="anim-action"></span>
  </div>
  <div class="anim-layout">
    <div class="anim-pair-stages">
      <div>
        <p class="anim-pane-title">model: spec counterexample</p>
        <div class="anim-stage-wrap">${stage(pair.model, " anim-stage--model")}</div>
        <p class="anim-pane-action"></p>
      </div>
      <div>
        <p class="anim-pane-title">runtime: recorded run</p>
        <div class="anim-stage-wrap">${stage(p, "")}</div>
      </div>
    </div>
    <ol class="anim-steps">
      ${stepItems}
    </ol>
  </div>
  <script type="application/json" class="anim-data">${data}</script>
</section>`;
}
