import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayer, type PlayerState } from "../src/player.ts";

describe("createPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on the first frame and steps with wrap-around", () => {
    const p = createPlayer(3);
    expect(p.state).toEqual({ index: 0, playing: false, length: 3 });
    p.next();
    p.next();
    expect(p.state.index).toBe(2);
    p.next();
    expect(p.state.index).toBe(0);
    p.prev();
    expect(p.state.index).toBe(2);
    p.first();
    expect(p.state.index).toBe(0);
    p.last();
    expect(p.state.index).toBe(2);
  });

  it("clamps goTo and only notifies on a change", () => {
    const p = createPlayer(3);
    const seen: number[] = [];
    p.subscribe((s) => seen.push(s.index));
    p.goTo(7);
    p.goTo(7);
    p.goTo(-1);
    expect(seen).toEqual([2, 0]);
  });

  it("plays on a timer, stops at the end, and reports playing", () => {
    const p = createPlayer(3, { interval: 100 });
    const seen: PlayerState[] = [];
    p.subscribe((s) => seen.push(s));
    p.play();
    expect(p.state.playing).toBe(true);
    vi.advanceTimersByTime(250);
    expect(p.state).toEqual({ index: 2, playing: true, length: 3 });
    vi.advanceTimersByTime(100);
    expect(p.state).toEqual({ index: 2, playing: false, length: 3 });
    expect(seen.map((s) => [s.index, s.playing])).toEqual([
      [0, true],
      [1, true],
      [2, true],
      [2, false],
    ]);
  });

  it("loops when asked, and restarts from the first frame when played at the end", () => {
    const p = createPlayer(2, { interval: 10, loop: true });
    p.play();
    vi.advanceTimersByTime(35);
    expect(p.state.index).toBe(1);
    expect(p.state.playing).toBe(true);
    p.stop();
    p.last();
    p.play();
    expect(p.state.index).toBe(0);
  });

  it("stops playback when stepped by hand, and toggles", () => {
    const p = createPlayer(5, { interval: 10 });
    p.toggle();
    expect(p.state.playing).toBe(true);
    p.next();
    expect(p.state).toMatchObject({ index: 1, playing: false });
    p.toggle();
    vi.advanceTimersByTime(10);
    expect(p.state).toMatchObject({ index: 2, playing: true });
    p.destroy();
    vi.advanceTimersByTime(50);
    expect(p.state.index).toBe(2);
  });

  it("unsubscribes and rejects an empty player", () => {
    const p = createPlayer(2);
    const seen: number[] = [];
    const off = p.subscribe((s) => seen.push(s.index));
    p.next();
    off();
    p.next();
    expect(seen).toEqual([1]);
    expect(() => createPlayer(0)).toThrow(/at least one frame/);
  });
});
