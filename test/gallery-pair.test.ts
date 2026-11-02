import { describe, expect, it } from "vitest";
import {
  group,
  renderGalleryFragment,
  type AnimationPage,
} from "../src/index.ts";
import { renderPairFragment } from "../src/gallery-pair.ts";

const page = (title: string, n: number): AnimationPage => ({
  title,
  subtitle: `${title} · ${n} frames`,
  note: undefined,
  width: 300,
  height: 100,
  frames: Array.from({ length: n }, (_, i) =>
    group([], { class: "frame", id: `frame-${i}` }),
  ),
  steps: Array.from({ length: n }, (_, i) => (i === 0 ? "Init" : `step ${i}`)),
  loopStart: null,
});

describe("renderPairFragment", () => {
  it("pre-renders both stages and ships the alignment with the steps", () => {
    const html = renderPairFragment(
      page("runtime", 4),
      { model: page("model", 2), alignment: [0, 0, 1, 1] },
      "pair-x",
      { heading: true },
    );
    expect(
      html.startsWith('<section class="anim anim-pair" data-anim="pair-x">'),
    ).toBe(true);
    expect(html.match(/<svg class="anim-stage/g)).toHaveLength(2);
    expect(html).toContain('class="anim-stage anim-stage--model"');
    expect(html.match(/<g class="frame"/g)).toHaveLength(6);
    expect(html).toContain(
      '{"steps":["Init","step 1","step 2","step 3"],"alignment":[0,0,1,1],"modelSteps":["Init","step 1"]}',
    );
    expect(html.match(/<button type="button" data-step=/g)).toHaveLength(4);
  });

  it("is used by the gallery for items with a pair", () => {
    const html = renderGalleryFragment({
      title: "G",
      items: [
        { id: "a", group: "Model", page: page("a", 2) },
        {
          id: "p",
          group: "Pairs",
          page: page("p", 3),
          pair: { model: page("m", 2), alignment: [0, 1, 1] },
        },
      ],
    });
    expect(html.match(/<section class="anim"/g)).toHaveLength(1);
    expect(html.match(/<section class="anim anim-pair"/g)).toHaveLength(1);
    expect(html).toContain('data-target="p">p</button>');
  });
});
