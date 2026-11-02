import { describe, expect, it } from "vitest";
import {
  group,
  renderAnimationHtml,
  type AnimationPage,
} from "../src/index.ts";

const page = (overrides: Partial<AnimationPage> = {}): AnimationPage => ({
  title: "Demo",
  subtitle: "Demo.tla · invariant-violation · 2 frames",
  note: undefined,
  width: 400,
  height: 200,
  frames: [
    group([], { class: "frame", id: "frame-0" }),
    group([], { class: "frame", id: "frame-1" }),
  ],
  steps: ["Init", "Next"],
  loopStart: null,
  ...overrides,
});

/** The six characters backslash u 0 0 3 c: how the page escapes `<` in JSON. */
const LT = "\\u003c";

describe("renderAnimationHtml", () => {
  it("embeds every frame inside one svg with the shared viewBox", () => {
    const html = renderAnimationHtml(page());
    expect(html).toContain('<svg class="anim-stage" viewBox="0 0 400 200"');
    expect(html).toContain('<g class="frame" id="frame-0"></g>');
    expect(html).toContain('<g class="frame" id="frame-1"></g>');
    expect(html).toContain('max="1"');
    expect(html.match(/<section class="anim"/g)).toHaveLength(1);
  });

  it("lists the steps and ships them as JSON without a closing script tag", () => {
    const html = renderAnimationHtml(
      page({ steps: ["Init", "</script><b>x</b>"] }),
    );
    expect(html).toContain(
      '<button type="button" data-step="1"><span class="n">1</span>&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;</button>',
    );
    expect(html).toContain(
      `<script type="application/json" class="anim-data">{"steps":["Init","${LT}/script>${LT}b>x${LT}/b>"]}</script>`,
    );
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it("escapes the title, subtitle and note", () => {
    const html = renderAnimationHtml(page({ title: "<x> & y", note: "a < b" }));
    expect(html).toContain("<title>&lt;x&gt; &amp; y</title>");
    expect(html).toContain('<p class="note">a &lt; b</p>');
  });

  it("mentions the loop of a liveness counterexample only when there is one", () => {
    expect(renderAnimationHtml(page())).not.toContain("Liveness violation");
    expect(renderAnimationHtml(page({ loopStart: 1 }))).toContain(
      "after the last frame the trace loops back to frame 1 forever",
    );
  });
});
