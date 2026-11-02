import { describe, expect, it } from "vitest";
import {
  group,
  renderAnimationFragment,
  renderGalleryFragment,
  renderGalleryHtml,
  type AnimationPage,
} from "../src/index.ts";

const page = (title: string): AnimationPage => ({
  title,
  subtitle: `${title} · 2 frames`,
  note: undefined,
  width: 300,
  height: 100,
  frames: [
    group([], { class: "frame", id: "frame-0" }),
    group([], { class: "frame", id: "frame-1" }),
  ],
  steps: ["Init", "Next"],
  loopStart: null,
});

const gallery = {
  title: "Demos",
  intro: "Two of them.",
  items: [
    { id: "model-a", group: "Model", page: page("A") },
    { id: "runtime-b", group: "Runtime", page: page("B") },
  ],
};

describe("renderAnimationFragment", () => {
  it("scopes everything to one .anim section with its steps as JSON", () => {
    const html = renderAnimationFragment(page("A"), "x");
    expect(html.startsWith('<section class="anim" data-anim="x">')).toBe(true);
    expect(html).toContain(
      '<script type="application/json" class="anim-data">{"steps":["Init","Next"]}</script>',
    );
    expect(html).not.toContain('id="prev"');
    expect(html).not.toContain("anim-title");
  });

  it("can carry its own heading", () => {
    const html = renderAnimationFragment(page("A"), "x", { heading: true });
    expect(html).toContain('<h2 class="anim-title">A</h2>');
  });
});

describe("renderGalleryFragment", () => {
  const html = renderGalleryFragment(gallery);

  it("is a body fragment with a title and style, no document wrapper", () => {
    expect(html.startsWith("<title>Demos</title>\n<style>")).toBe(true);
    expect(html).not.toContain("<!doctype");
    expect(html).not.toContain("<body>");
  });

  it("has one tab per item under its group and one .anim per item", () => {
    expect(html).toContain('<span class="gallery-group">Model</span>');
    expect(html).toContain('<span class="gallery-group">Runtime</span>');
    expect(html).toContain(
      '<button type="button" class="gallery-tab" data-target="model-a">A</button>',
    );
    expect(html).toContain(
      '<button type="button" class="gallery-tab" data-target="runtime-b">B</button>',
    );
    expect(html.match(/<section class="anim"/g)).toHaveLength(2);
    expect(html.match(/<script>/g)).toHaveLength(1);
  });
});

describe("renderGalleryHtml", () => {
  it("wraps the same body in a document", () => {
    const html = renderGalleryHtml(gallery);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Demos</title>");
    expect(html.match(/<section class="anim"/g)).toHaveLength(2);
    expect(html.match(/<style>/g)).toHaveLength(1);
  });
});
