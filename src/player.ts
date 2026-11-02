/*
 * The player: which frame is current, and whether frames advance on a
 * timer. Pure state with listeners, no DOM, so it can drive one viewer or
 * two synchronised ones (milestone M5).
 */

export interface PlayerState {
  readonly index: number;
  readonly playing: boolean;
  readonly length: number;
}

export type PlayerListener = (state: PlayerState) => void;

export interface PlayerOptions {
  /** Milliseconds between frames while playing. Default 700. */
  readonly interval?: number;
  /** Start again from the first frame after the last one. Default: stop at the end. */
  readonly loop?: boolean;
}

export interface Player {
  readonly state: PlayerState;
  /** Clamps into range. Stepping by hand stops playback. */
  goTo(index: number): void;
  /** Wraps around, like the page's Prev and Next. */
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  play(): void;
  stop(): void;
  toggle(): void;
  /** Called after every change. Returns the unsubscribe function. */
  subscribe(listener: PlayerListener): () => void;
  destroy(): void;
}

export function createPlayer(
  length: number,
  options: PlayerOptions = {},
): Player {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`a player needs at least one frame, got ${length}`);
  }
  const interval = options.interval ?? 700;
  const loop = options.loop ?? false;
  const listeners = new Set<PlayerListener>();
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const state = (): PlayerState => ({ index, playing: timer !== null, length });
  const notify = (): void => {
    const s = state();
    for (const listener of listeners) listener(s);
  };
  const stop = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    notify();
  };
  const set = (i: number): void => {
    const was = timer !== null;
    if (was) {
      clearInterval(timer as ReturnType<typeof setInterval>);
      timer = null;
    }
    const n = Math.min(Math.max(i, 0), length - 1);
    if (n !== index || was) {
      index = n;
      notify();
    }
  };
  const tick = (): void => {
    if (index < length - 1) {
      index += 1;
      notify();
    } else if (loop) {
      index = 0;
      notify();
    } else {
      stop();
    }
  };
  const play = (): void => {
    if (timer !== null) return;
    if (index === length - 1) index = 0;
    timer = setInterval(tick, interval);
    notify();
  };

  return {
    get state() {
      return state();
    },
    goTo: set,
    next: () => set((index + 1) % length),
    prev: () => set((index - 1 + length) % length),
    first: () => set(0),
    last: () => set(length - 1),
    play,
    stop,
    toggle: () => (timer === null ? play() : stop()),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      listeners.clear();
    },
  };
}
