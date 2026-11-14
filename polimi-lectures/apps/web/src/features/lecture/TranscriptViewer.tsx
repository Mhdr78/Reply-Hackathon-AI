import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronDown, ChevronUp, Download, LocateFixed, Play, Search, Sparkles, X } from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/format';
import type { ChaptersState } from '@/hooks/useChapters';
import type { Chapter, TimeSelection, Transcript, TranscriptSegment } from '@/types/domain';
import { rangeToSelection } from './transcriptSelection';
import { usePlayback, usePlaybackStore } from './playback';
import { ChapterList } from './ChapterList';

const SPEAKER_COLORS = ['text-brand-600', 'text-violet-600', 'text-emerald-600', 'text-amber-600'];

/** Index of the last segment whose start <= t (binary search), or -1. */
function findActive(segments: TranscriptSegment[], t: number) {
  let lo = 0, hi = segments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export type TranscriptPanelView = 'transcript' | 'chapters';

interface TranscriptViewerProps {
  transcript: Transcript;
  chapters: { state: ChaptersState; chapters?: Chapter[]; retry: () => void; regenerate?: () => void };
  view: TranscriptPanelView;
  onViewChange: (v: TranscriptPanelView) => void;
  /** The current lecture selection (highlighted in the transcript). */
  selection: TimeSelection | null;
  /** Ask the assistant about a selected part of the lecture. */
  onAsk: (sel: TimeSelection) => void;
}

export function TranscriptViewer({ transcript, chapters: chapterData, view, onViewChange, selection, onAsk }: TranscriptViewerProps) {
  const store = usePlaybackStore();
  const { segments } = transcript;
  const active = usePlayback((s) => findActive(segments, s.currentTime));
  const playing = usePlayback((s) => s.playing);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ sel: TimeSelection; x: number; y: number }>();

  // Text selection → time range, with a floating "Ask AI" button above it.
  const readSelection = useCallback(() => {
    const ds = window.getSelection();
    const box = scrollRef.current;
    const card = cardRef.current;
    if (!ds || ds.rangeCount === 0 || ds.isCollapsed || !box || !card) return setPick(undefined);
    const range = ds.getRangeAt(0);
    const sel = rangeToSelection(range, box, segments);
    if (!sel) return setPick(undefined);
    const r = range.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    setPick({ sel, x: Math.max(130, Math.min(c.width - 130, r.left + r.width / 2 - c.left)), y: Math.max(56, r.top - c.top) });
  }, [segments]);

  useEffect(() => {
    const onChange = () => { const ds = window.getSelection(); if (!ds || ds.isCollapsed) setPick(undefined); };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);

  const chapters = chapterData.chapters;
  // Segment index → chapter that starts there (chapters are aligned to segment starts).
  const chapterAt = useMemo(() => {
    const m = new Map<number, { chapter: Chapter; n: number }>();
    chapters?.forEach((chapter, n) => {
      const i = segments.findIndex((s) => s.start >= chapter.start - 0.01);
      if (i >= 0 && !m.has(i)) m.set(i, { chapter, n });
    });
    return m;
  }, [chapters, segments]);

  const speakerIds = useMemo(() => [...new Set(segments.map((s) => s.speaker).filter(Boolean))] as string[], [segments]);
  const speakerName = useCallback((id?: string) => (id ? transcript.speakers?.[id] ?? id.replace('SPEAKER_', 'Speaker ') : ''), [transcript.speakers]);

  // Search: list of segment ids containing the query
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q.length < 2 ? [] : segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.id)), [segments, q]);
  useEffect(() => { setMatchIdx(0); }, [q]);
  const currentMatch = matches.length ? matches[Math.min(matchIdx, matches.length - 1)] : undefined;

  const scrollToSegment = useCallback((id: number, smooth = true) => {
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-seg="${id}"]`);
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.32, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Auto-scroll to the active segment
  useEffect(() => {
    if (view === 'transcript' && follow && active >= 0 && currentMatch === undefined) scrollToSegment(segments[active].id);
  }, [active, follow, segments, scrollToSegment, currentMatch, view]);

  // Returning to the transcript tab: jump straight to the current position.
  useEffect(() => {
    if (view === 'transcript' && active >= 0) scrollToSegment(segments[active].id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Scroll to current search hit
  useEffect(() => {
    if (currentMatch !== undefined) scrollToSegment(currentMatch);
  }, [currentMatch, scrollToSegment]);

  const stepMatch = (d: number) => matches.length && setMatchIdx((i) => (i + d + matches.length) % matches.length);
  const onSegmentClick = useCallback((seg: TranscriptSegment) => {
    if (window.getSelection()?.isCollapsed === false) return; // the student is selecting text, not clicking
    store.seek(seg.start, { play: true });
    setFollow(true);
  }, [store]);
  const onChapterClick = useCallback((c: Chapter) => {
    store.seek(c.start, { play: true });
    setFollow(true);
  }, [store]);

  function download() {
    const blob = new Blob([JSON.stringify({ language: transcript.language, segments: segments.map(({ id: _id, ...s }) => s) }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${transcript.lectureId}-transcript.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div ref={cardRef} className="card relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div role="tablist" aria-label="Transcript panel" className="mr-auto flex h-8 items-center rounded-lg bg-slate-100 p-0.5">
          <Tab selected={view === 'transcript'} onClick={() => onViewChange('transcript')}>Transcript</Tab>
          <Tab selected={view === 'chapters'} onClick={() => onViewChange('chapters')}>
            Chapters
            {chapters && <span className={cn('rounded px-1 text-[11px] tabular', view === 'chapters' ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/80 text-slate-500')}>{chapters.length}</span>}
          </Tab>
        </div>
        {view === 'transcript' && (<>
        <div className="relative flex h-8 items-center rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
          <Search className="ml-2.5 size-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') setQuery(''); }}
            placeholder="Search transcript"
            aria-label="Search transcript"
            className="h-full w-36 bg-transparent px-2 text-[13px] outline-none placeholder:text-slate-400 sm:w-48"
          />
          {q.length >= 2 && (
            <div className="flex items-center gap-0.5 pr-1 text-xs text-slate-500">
              <span className="px-1 tabular">{matches.length ? `${matchIdx + 1}/${matches.length}` : '0/0'}</span>
              <IconBtn label="Previous match" onClick={() => stepMatch(-1)}><ChevronUp className="size-3.5" /></IconBtn>
              <IconBtn label="Next match" onClick={() => stepMatch(1)}><ChevronDown className="size-3.5" /></IconBtn>
              <IconBtn label="Clear search" onClick={() => setQuery('')}><X className="size-3.5" /></IconBtn>
            </div>
          )}
        </div>
        <button
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          title="Automatically scroll to the current segment"
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium shadow-sm transition', follow ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
        >
          <LocateFixed className="size-3.5" /> Follow
        </button>
        <IconBtn label="Download transcript (JSON)" onClick={download} className="size-8 border border-slate-200 bg-white shadow-sm"><Download className="size-3.5" /></IconBtn>
        </>)}
      </div>

      {view === 'chapters' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-3">
          <ChapterList state={chapterData.state} onRetry={chapterData.retry} onRegenerate={chapterData.regenerate} onSelect={onChapterClick} onAsk={(c) => onAsk({ start: c.start, end: c.end, source: 'timeline', text: c.title })} />
        </div>
      )}

      {/* Segments */}
      <div
        ref={scrollRef}
        onWheel={() => follow && setFollow(false)}
        onTouchMove={() => follow && setFollow(false)}
        onMouseUp={() => setTimeout(readSelection, 0)}
        onKeyUp={(e) => e.shiftKey && readSelection()}
        className={cn('relative min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-3', view !== 'transcript' && 'hidden')}
      >
        <ol className="mx-auto max-w-3xl">
          {segments.map((seg, i) => (
            <Fragment key={seg.id}>
            {chapterAt.has(i) && <ChapterHeading {...chapterAt.get(i)!} onClick={onChapterClick} />}
            <Segment
              seg={seg}
              active={i === active}
              past={i < active}
              showSpeaker={!!seg.speaker && (seg.speaker !== segments[i - 1]?.speaker || chapterAt.has(i))}
              inSelection={!!selection && seg.start < selection.end && seg.end > selection.start}
              speaker={speakerName(seg.speaker)}
              speakerColor={SPEAKER_COLORS[Math.max(0, speakerIds.indexOf(seg.speaker ?? '')) % SPEAKER_COLORS.length]}
              query={q.length >= 2 ? q : ''}
              isCurrentMatch={seg.id === currentMatch}
              onClick={onSegmentClick}
            />
            </Fragment>
          ))}
        </ol>
        <div className="h-[30%]" />
      </div>

      {pick && view === 'transcript' && (
        <div
          className="absolute z-20 flex -translate-x-1/2 -translate-y-full animate-fade-in items-center gap-0.5 rounded-lg bg-slate-900 p-1 text-white shadow-xl"
          style={{ left: pick.x, top: pick.y - 6 }}
          onMouseDown={(e) => e.preventDefault()} // keep the text selection while clicking
        >
          <button
            onClick={() => { onAsk(pick.sel); window.getSelection()?.removeAllRanges(); setPick(undefined); }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium hover:bg-white/15"
          >
            <Sparkles className="size-3.5 text-brand-200" />Ask AI
            <span className="font-mono text-[11px] text-white/60">{formatTimestamp(pick.sel.start)}–{formatTimestamp(pick.sel.end)}</span>
          </button>
          <button onClick={() => store.seek(pick.sel.start, { play: true })} title="Play from here" aria-label="Play from the start of the selection" className="grid size-7 place-items-center rounded-md hover:bg-white/15">
            <Play className="size-3.5 fill-current" />
          </button>
        </div>
      )}

      {view === 'transcript' && !follow && playing && (
        <div className="pointer-events-none relative">
          <button
            onClick={() => { setFollow(true); setQuery(''); if (active >= 0) scrollToSegment(segments[active].id); }}
            className="pointer-events-auto absolute bottom-3 left-1/2 inline-flex h-8 -translate-x-1/2 animate-fade-in items-center gap-1.5 rounded-full bg-slate-900 px-3.5 text-[12.5px] font-medium text-white shadow-lg hover:bg-slate-800"
          >
            <ArrowDownToLine className="size-3.5" /> Back to current
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition', selected ? 'bg-white text-ink shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800')}
    >
      {children}
    </button>
  );
}

/** Inline chapter divider inside the transcript. */
const ChapterHeading = memo(function ChapterHeading({ chapter, n, onClick }: { chapter: Chapter; n: number; onClick: (c: Chapter) => void }) {
  return (
    <li className={cn('pl-2 pr-3', n === 0 ? 'mb-2' : 'mb-2 mt-7')}>
      <button onClick={() => onClick(chapter)} className="group flex w-full items-baseline gap-3 text-left">
        <span className="w-14 shrink-0 text-right font-mono text-[11px] uppercase tracking-wider text-slate-400 group-hover:text-brand-600">Ch. {n + 1}</span>
        <span className="min-w-0 flex-1 border-b border-slate-100 pb-1.5 text-[15.5px] font-semibold tracking-tight text-ink group-hover:text-brand-700">{chapter.title}</span>
      </button>
    </li>
  );
});

function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn('grid size-6 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800', className)}>
      {children}
    </button>
  );
}

interface SegmentProps {
  seg: TranscriptSegment;
  active: boolean;
  past: boolean;
  showSpeaker: boolean;
  speaker: string;
  speakerColor: string;
  query: string;
  isCurrentMatch: boolean;
  inSelection: boolean;
  onClick: (s: TranscriptSegment) => void;
}

const Segment = memo(function Segment({ seg, active, past, showSpeaker, speaker, speakerColor, query, isCurrentMatch, inSelection, onClick }: SegmentProps) {
  return (
    <li data-seg={seg.id} className={cn(showSpeaker && 'mt-3 first:mt-0')}>
      {showSpeaker && <div className={cn('mb-0.5 select-none pl-[76px] text-[11.5px] font-semibold uppercase tracking-wider', speakerColor)}>{speaker}</div>}
      {/* A div (not a button) so the text can be selected; click still seeks. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(seg)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(seg); } }}
        aria-current={active || undefined}
        className={cn(
          'group relative flex w-full cursor-pointer gap-3 rounded-lg py-1.5 pl-2 pr-3 text-left transition-colors duration-200',
          active ? 'bg-brand-50' : inSelection ? 'bg-amber-50/80' : 'hover:bg-slate-50',
          isCurrentMatch && !active && 'bg-amber-50',
        )}
      >
        {inSelection && !active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-amber-400" />}
        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-600" />}
        <span className={cn('w-14 shrink-0 select-none pt-[3px] text-right font-mono text-[11.5px] tabular transition-colors', active ? 'font-semibold text-brand-600' : 'text-slate-400 group-hover:text-brand-600')}>
          {formatTimestamp(seg.start)}
        </span>
        <span data-seg-text className={cn('text-[15px] leading-7 transition-colors selection:bg-amber-200', active ? 'text-ink' : past ? 'text-slate-600' : 'text-slate-700')}>
          {query ? <Highlighted text={seg.text} query={query} current={isCurrentMatch} /> : active && seg.words.length ? <ActiveWords seg={seg} /> : seg.text}
        </span>
      </div>
    </li>
  );
});

/** Word-level karaoke highlighting; only the active segment subscribes to the clock. */
function ActiveWords({ seg }: { seg: TranscriptSegment }) {
  const wordIdx = usePlayback((s) => {
    let idx = -1;
    for (let i = 0; i < seg.words.length; i++) if (seg.words[i].start <= s.currentTime) idx = i; else break;
    return idx;
  });
  return (
    <>
      {seg.words.map((w, i) => (
        <span key={i} className={cn('rounded-[3px] transition-colors duration-100', i === wordIdx && 'bg-brand-200/70', i > wordIdx && 'text-slate-500')}>
          {w.word}{i < seg.words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

function Highlighted({ text, query, current }: { text: string; query: string; current: boolean }) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, i)) {
    parts.push(text.slice(i, at), <mark key={at} className={cn('hit', current && 'hit-current')}>{text.slice(at, at + query.length)}</mark>);
    i = at + query.length;
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}
