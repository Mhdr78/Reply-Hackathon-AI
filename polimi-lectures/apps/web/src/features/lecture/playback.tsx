import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Shared playback state for the video player, the transcript and the chat.
 * A tiny external store: components subscribe with a selector, so only what changes re-renders
 * (the transcript re-renders when the active segment changes, not on every frame).
 *
 * "simulated" mode drives a virtual clock when no video file is available, so the transcript sync still works.
 */
export interface PlaybackState {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  volume: number;
  muted: boolean;
  buffering: boolean;
  mode: 'video' | 'simulated';
  videoError?: string;
}

export function createPlaybackStore(fallbackDuration: number) {
  let state: PlaybackState = { currentTime: 0, duration: 0, playing: false, rate: 1, volume: 1, muted: false, buffering: false, mode: 'video' };
  const subs = new Set<() => void>();
  let video: HTMLVideoElement | null = null;
  let raf = 0;
  let last = 0;

  const set = (patch: Partial<PlaybackState>) => {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  };

  const tick = (now: number) => {
    if (state.mode === 'video' && video) {
      set({ currentTime: video.currentTime });
    } else if (state.mode === 'simulated') {
      const t = Math.min(state.duration, state.currentTime + ((now - last) / 1000) * state.rate);
      last = now;
      set({ currentTime: t });
      if (t >= state.duration) return set({ playing: false });
    }
    raf = requestAnimationFrame(tick);
  };
  const startLoop = () => {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stopLoop = () => cancelAnimationFrame(raf);

  const api = {
    get: () => state,
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    /** Called by the <video> element's event handlers. */
    _set: set,
    attach(el: HTMLVideoElement | null) {
      video = el;
    },
    onVideoPlay: () => { set({ playing: true }); startLoop(); },
    onVideoPause: () => { stopLoop(); set({ playing: false, currentTime: video?.currentTime ?? state.currentTime }); },
    simulate(duration = fallbackDuration) {
      video?.pause();
      set({ mode: 'simulated', duration, videoError: undefined, buffering: false });
    },
    play() {
      if (state.mode === 'video') void video?.play().catch(() => {});
      else {
        if (state.currentTime >= state.duration) set({ currentTime: 0 });
        set({ playing: true });
        startLoop();
      }
    },
    pause() {
      if (state.mode === 'video') video?.pause();
      else { stopLoop(); set({ playing: false }); }
    },
    toggle() {
      if (state.playing) api.pause(); else api.play();
    },
    seek(t: number, opts: { play?: boolean } = {}) {
      const clamped = Math.max(0, state.duration ? Math.min(t, state.duration) : t);
      if (state.mode === 'video' && video) video.currentTime = clamped;
      set({ currentTime: clamped });
      if (opts.play) api.play();
    },
    skip(delta: number) {
      api.seek(state.currentTime + delta);
    },
    setRate(rate: number) {
      if (video) video.playbackRate = rate;
      set({ rate });
    },
    setVolume(volume: number) {
      if (video) { video.volume = volume; video.muted = volume === 0; }
      set({ volume, muted: volume === 0 });
    },
    toggleMute() {
      const muted = !state.muted;
      if (video) video.muted = muted;
      set({ muted });
    },
    dispose() {
      stopLoop();
      subs.clear();
    },
  };
  return api;
}

export type PlaybackStore = ReturnType<typeof createPlaybackStore>;

const Ctx = createContext<PlaybackStore | null>(null);

export function PlaybackProvider({ fallbackDuration, children }: { fallbackDuration: number; children: ReactNode }) {
  const [store] = useState(() => createPlaybackStore(fallbackDuration));
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePlaybackStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('usePlaybackStore must be used inside PlaybackProvider');
  return s;
}

/** Subscribe to a slice of playback state. The selector must return a primitive or stable value. */
export function usePlayback<T>(selector: (s: PlaybackState) => T): T {
  const store = usePlaybackStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
