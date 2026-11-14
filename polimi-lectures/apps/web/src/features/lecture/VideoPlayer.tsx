import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Gauge, Scissors, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Video, Volume2, VolumeX } from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/format';
import { findChapterIndex } from '@/services/chapters/chapterizer';
import type { Chapter, TimeSelection } from '@/types/domain';
import { usePlayback, usePlaybackStore } from './playback';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface VideoPlayerProps {
  src: string;
  title: string;
  simulatedDuration?: number;
  /** When present, the seek bar is split into chapters and the current chapter is shown in the controls. */
  chapters?: Chapter[];
  onShowChapters?: () => void;
  /** Current selected range, drawn on the seek bar. */
  selection?: TimeSelection | null;
  /** Called after Shift+drag (or Clip mode + drag) on the seek bar. */
  onSelectRange?: (sel: TimeSelection) => void;
}

export function VideoPlayer({ src, title, simulatedDuration, chapters, onShowChapters, selection, onSelectRange }: VideoPlayerProps) {
  const [clipMode, setClipMode] = useState(false);
  const store = usePlaybackStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = usePlayback((s) => s.playing);
  const buffering = usePlayback((s) => s.buffering);
  const mode = usePlayback((s) => s.mode);
  const videoError = usePlayback((s) => s.videoError);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    store.attach(videoRef.current);
    return () => store.attach(null);
  }, [store]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable=true]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, () => void> = {
        ' ': () => store.toggle(), k: () => store.toggle(),
        ArrowLeft: () => store.skip(-5), ArrowRight: () => store.skip(5),
        j: () => store.skip(-10), l: () => store.skip(10), m: () => store.toggleMute(),
        f: () => toggleFullscreen(),
        Escape: () => setClipMode(false),
        // Like YouTube: Shift+←/→ jumps to the previous/next chapter.
        ...(e.shiftKey && chapters?.length ? { ArrowLeft: () => jumpChapter(-1), ArrowRight: () => jumpChapter(1) } : {}),
      };
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function jumpChapter(dir: -1 | 1) {
    if (!chapters?.length) return;
    const t = store.get().currentTime;
    const i = findChapterIndex(chapters, t);
    // Going back: restart the current chapter unless we are within its first 3 seconds.
    const target = dir === 1 ? chapters[i + 1] : t - (chapters[i]?.start ?? 0) > 3 ? chapters[i] : chapters[i - 1];
    if (target) store.seek(target.start);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.();
  }

  function poke() {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }

  const hideControls = playing && idle && !clipMode;

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onMouseLeave={() => playing && setIdle(true)}
      className={cn('group relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 shadow-lg ring-1 ring-slate-900/10', fullscreen && 'rounded-none', hideControls && 'cursor-none')}
    >
      <video
        ref={videoRef}
        src={src}
        className={cn('size-full object-contain', mode === 'simulated' && 'invisible')}
        preload="metadata"
        playsInline
        onClick={() => store.toggle()}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={(e) => store._set({ duration: e.currentTarget.duration, videoError: undefined })}
        onPlay={store.onVideoPlay}
        onPause={store.onVideoPause}
        onEnded={store.onVideoPause}
        onWaiting={() => store._set({ buffering: true })}
        onPlaying={() => store._set({ buffering: false })}
        onCanPlay={() => store._set({ buffering: false })}
        onSeeked={(e) => store._set({ currentTime: e.currentTarget.currentTime })}
        onVolumeChange={(e) => store._set({ volume: e.currentTarget.volume, muted: e.currentTarget.muted })}
        onError={() => store.get().mode === 'video' && store._set({ videoError: 'The recording could not be loaded.' })}
      />

      {mode === 'simulated' && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand-900 to-slate-900 text-center text-white" onClick={() => store.toggle()}>
          <div className="px-6">
            <Video className="mx-auto size-8 text-brand-200/70" />
            <div className="mt-3 text-[15px] font-medium">{title}</div>
            <div className="mt-1 text-xs text-brand-100/60">Simulated playback — no video file loaded</div>
          </div>
        </div>
      )}

      {videoError && mode === 'video' && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-900 p-6 text-center text-white">
          <div className="max-w-md">
            <Video className="mx-auto size-8 text-slate-400" />
            <p className="mt-3 font-medium">Recording not available</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
              {videoError} In demo mode, place an MP4 at <code className="rounded bg-white/10 px-1">public/media/sample-lecture.mp4</code> or set <code className="rounded bg-white/10 px-1">VITE_LECTURE_VIDEO_URL</code>.
            </p>
            <button onClick={() => store.simulate(simulatedDuration)} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-100">
              <Play className="size-4" /> Simulate playback with transcript
            </button>
          </div>
        </div>
      )}

      {buffering && playing && <Loader2 className="pointer-events-none absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80" />}

      {!playing && !videoError && (
        <button onClick={() => store.play()} aria-label="Play" className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow-xl transition hover:scale-105 hover:bg-white">
          <Play className="ml-1 size-7 fill-current" />
        </button>
      )}

      {!videoError && (
        <div className={cn('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200 sm:px-4', hideControls ? 'opacity-0' : 'opacity-100')}>
          <SeekBar chapters={chapters} selection={selection} clipMode={clipMode} onSelectRange={onSelectRange && ((sel) => { setClipMode(false); onSelectRange(sel); })} />
          <div className="mt-1.5 flex items-center gap-1 text-white">
            <CtrlButton label={playing ? 'Pause (k)' : 'Play (k)'} onClick={() => store.toggle()}>
              {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
            </CtrlButton>
            <CtrlButton label="Back 10 seconds (j)" onClick={() => store.skip(-10)}><RotateCcw className="size-[18px]" /></CtrlButton>
            <CtrlButton label="Forward 10 seconds (l)" onClick={() => store.skip(10)}><RotateCw className="size-[18px]" /></CtrlButton>
            <Volume />
            <TimeDisplay />
            {chapters?.length ? <ChapterLabel chapters={chapters} onClick={onShowChapters} /> : null}
            <div className="flex-1" />
            {onSelectRange && (
              <button
                onClick={() => setClipMode((c) => !c)}
                aria-pressed={clipMode}
                title={clipMode ? 'Drag on the timeline to select a part (Esc to cancel)' : 'Select a part of the video to ask about (or Shift+drag on the timeline)'}
                className={cn('flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition', clipMode ? 'bg-amber-400 text-slate-900' : 'text-white/90 hover:bg-white/15')}
              >
                <Scissors className="size-4" /><span className={clipMode ? 'whitespace-nowrap' : 'hidden whitespace-nowrap 2xl:inline'}>{clipMode ? 'Drag to select' : 'Select part'}</span>
              </button>
            )}
            <SpeedMenu />
            <CtrlButton label={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
            </CtrlButton>
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-9 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white">
      {children}
    </button>
  );
}

const GAP_PX = 3; // visual gap between chapters on the seek bar

/**
 * YouTube-style seek bar. A native range input on top keeps keyboard/drag/accessibility behaviour;
 * underneath, the track is drawn as one block per chapter with a gap between them. Hovering grows the
 * hovered chapter and shows a preview tooltip with the chapter title and the time under the cursor.
 */
function SeekBar({ chapters, selection, clipMode, onSelectRange }: { chapters?: Chapter[]; selection?: TimeSelection | null; clipMode: boolean; onSelectRange?: (sel: TimeSelection) => void }) {
  const store = usePlaybackStore();
  const t = usePlayback((s) => s.currentTime);
  const d = usePlayback((s) => s.duration);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; width: number; time: number }>();
  const [drag, setDrag] = useState<{ from: number; to: number }>();
  const shift = useShiftKey();
  const selecting = !!onSelectRange && (clipMode || shift || !!drag);

  // Blocks as fractions of the full duration. The last chapter stretches to the end of the video.
  const blocks = useMemo(() => {
    if (!d || !chapters?.length) return [{ from: 0, to: d || 1, title: undefined as string | undefined }];
    return chapters
      .filter((c) => c.start < d)
      .map((c, i, arr) => ({ from: c.start, to: i === arr.length - 1 ? d : Math.min(arr[i + 1].start, d), title: c.title }));
  }, [chapters, d]);
  const span = d || 1;

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const r = ref.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    setHover({ x, width: r.width, time: (x / r.width) * span });
  };

  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.max(0, Math.min(r.width, clientX - r.left)) / r.width) * span;
  };
  const band = drag ? { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) } : selection;

  let hoverBlock = -1;
  if (hover) blocks.forEach((b, i) => { if (b.from <= hover.time) hoverBlock = i; });
  const hoverTitle = hoverBlock >= 0 ? blocks[hoverBlock].title : undefined;
  const multi = blocks.length > 1;

  return (
    <div ref={ref} className="relative h-4" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2">
        {blocks.map((b, i) => {
          const fill = Math.max(0, Math.min(1, (t - b.from) / (b.to - b.from)));
          const preview = hover ? Math.max(0, Math.min(1, (hover.time - b.from) / (b.to - b.from))) : 0;
          const last = i === blocks.length - 1;
          return (
            <div
              key={i}
              className={cn('absolute inset-y-0 overflow-hidden rounded-[2px] bg-white/25 transition-transform duration-150', hover && (!multi || i === hoverBlock) ? 'scale-y-[1.7]' : 'scale-y-100')}
              style={{ left: `${(b.from / span) * 100}%`, width: `calc(${((b.to - b.from) / span) * 100}% - ${multi && !last ? GAP_PX : 0}px)` }}
            >
              {preview > fill && <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${preview * 100}%` }} />}
              <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
      </div>
      {band && d > 0 && (
        <div
          className="pointer-events-none absolute top-1/2 z-[1] h-[9px] -translate-y-1/2 rounded-[3px] bg-amber-400/90 ring-2 ring-amber-300/40"
          style={{ left: `${(band.start / span) * 100}%`, width: `max(4px, ${((band.end - band.start) / span) * 100}%)` }}
        />
      )}
      <input
        type="range" className="range absolute inset-0 block h-4 w-full" aria-label="Seek" min={0} max={d || 0} step={0.1} value={Math.min(t, d || 0)}
        aria-valuetext={`${formatTimestamp(t)}${chapters?.length ? ` · ${chapters[Math.max(0, findChapterIndex(chapters, t))].title}` : ''}`}
        onChange={(e) => store.seek(Number(e.target.value))}
      />
      {/* Range-selection layer: captures the pointer instead of the range input while selecting. */}
      {selecting && d > 0 && (
        <div
          className="absolute inset-x-0 -inset-y-2 z-[2] cursor-col-resize"
          onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const t = timeAt(e.clientX); setDrag({ from: t, to: t }); }}
          onPointerMove={(e) => drag && setDrag({ ...drag, to: timeAt(e.clientX) })}
          onPointerUp={() => {
            if (drag) {
              const start = Math.min(drag.from, drag.to), end = Math.max(drag.from, drag.to);
              if (end - start >= 1) onSelectRange?.({ start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, source: 'timeline' });
            }
            setDrag(undefined);
          }}
          onPointerCancel={() => setDrag(undefined)}
        />
      )}
      {drag && (
        <div className="pointer-events-none absolute bottom-6 z-10 -translate-x-1/2 rounded-md bg-amber-400 px-2 py-1 font-mono text-[11.5px] font-semibold text-slate-900 shadow-lg" style={{ left: `${((drag.from + drag.to) / 2 / span) * 100}%` }}>
          {formatTimestamp(Math.min(drag.from, drag.to))}–{formatTimestamp(Math.max(drag.from, drag.to))}
        </div>
      )}
      {hover && d > 0 && !drag && (
        <div
          className="pointer-events-none absolute bottom-6 z-10 flex max-w-[240px] -translate-x-1/2 flex-col items-center gap-1 text-center"
          style={{ left: Math.max(70, Math.min(hover.width - 70, hover.x)) }}
        >
          {hoverTitle && (
            <span className="line-clamp-2 rounded-md bg-slate-900/90 px-2.5 py-1 text-[12px] font-medium leading-snug text-white shadow-lg ring-1 ring-white/10">
              {hoverTitle}
            </span>
          )}
          <span className="rounded bg-slate-900/90 px-1.5 py-0.5 font-mono text-[11px] text-white tabular">{formatTimestamp(hover.time)}</span>
          {selecting && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-900">Drag to select a part</span>}
        </div>
      )}
    </div>
  );
}

/** True while Shift is held (enables range selection on the seek bar). */
function useShiftKey() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setHeld(e.shiftKey);
    const off = () => setHeld(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off); };
  }, []);
  return held;
}

/** "• Chapter title ›" next to the time, like YouTube. Opens the chapter list. */
function ChapterLabel({ chapters, onClick }: { chapters: Chapter[]; onClick?: () => void }) {
  const idx = usePlayback((s) => findChapterIndex(chapters, s.currentTime));
  const chapter = chapters[Math.max(0, idx)];
  return (
    <button
      onClick={onClick}
      title="View all chapters"
      className="ml-1 hidden h-8 min-w-0 max-w-[38%] items-center gap-1 rounded-md px-2 text-xs text-white/90 transition hover:bg-white/15 hover:text-white sm:inline-flex"
    >
      <span className="text-white/40">•</span>
      <span className="truncate">{chapter.title}</span>
      <ChevronRight className="size-3.5 shrink-0 text-white/60" />
    </button>
  );
}

function TimeDisplay() {
  const t = usePlayback((s) => Math.floor(s.currentTime));
  const d = usePlayback((s) => s.duration);
  return <span className="ml-2 shrink-0 whitespace-nowrap font-mono text-xs text-white/90 tabular">{formatTimestamp(t)} <span className="text-white/50">/ {formatTimestamp(d)}</span></span>;
}

function Volume() {
  const store = usePlaybackStore();
  const volume = usePlayback((s) => s.volume);
  const muted = usePlayback((s) => s.muted);
  const v = muted ? 0 : volume;
  return (
    <div className="group/vol hidden items-center sm:flex">
      <CtrlButton label={muted ? 'Unmute (m)' : 'Mute (m)'} onClick={() => store.toggleMute()}>
        {v === 0 ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
      </CtrlButton>
      <input
        type="range" aria-label="Volume" min={0} max={1} step={0.05} value={v} onChange={(e) => store.setVolume(Number(e.target.value))}
        className="range h-4 w-0 opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
        style={{ background: `linear-gradient(to right, #fff 0 ${v * 100}%, rgba(255,255,255,.28) ${v * 100}% 100%) center / 100% 4px no-repeat` }}
      />
    </div>
  );
}

function SpeedMenu() {
  const store = usePlaybackStore();
  const rate = usePlayback((s) => s.rate);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Playback speed" aria-expanded={open} className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-white/90 hover:bg-white/15">
        <Gauge className="size-4" />{rate}×
      </button>
      {open && (
        <div role="menu" className="absolute bottom-11 right-0 w-32 animate-fade-in rounded-lg bg-slate-900/95 p-1 text-sm text-white shadow-xl ring-1 ring-white/10 backdrop-blur">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-white/50">Speed</div>
          {RATES.map((r) => (
            <button key={r} role="menuitemradio" aria-checked={r === rate} onClick={() => { store.setRate(r); setOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-white/10">
              {r === 1 ? 'Normal' : `${r}×`}{r === rate && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
