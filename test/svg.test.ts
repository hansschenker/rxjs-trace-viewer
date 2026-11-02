import { describe, expect, it } from "vitest";
import { circle, group, serialize, text, title } from "../src/svg.ts";

describe("serialize", () => {
  it("writes an element with its attributes and children", () => {
    const g = group([circle(10, 20, 5, { fill: "#C2185B" })], { class: "frame", id: "frame-0" });
    expect(serialize(g)).toBe('<g class="frame" id="frame-0"><circle cx="10" cy="20" r="5" fill="#C2185B"></circle></g>');
  });

  it("escapes text and attribute values", () => {
    expect(serialize(text(1, 2, "<<a, b>> & c", { "data-x": 'say "hi"' }))).toBe(
      '<text x="1" y="2" data-x="say &quot;hi&quot;">&lt;&lt;a, b&gt;&gt; &amp; c</text>',
    );
  });

  it("puts a title before the text content", () => {
    expect(serialize(text(0, 0, "short", {}, [title("the full value")]))).toBe(
      '<text x="0" y="0"><title>the full value</title>short</text>',
    );
  });

  it("rounds numbers to two decimals", () => {
    expect(serialize(circle(1.23456, 2, 3))).toBe('<circle cx="1.23" cy="2" r="3"></circle>');
  });
});
