import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock, FileUp, MapPin, Play, Scissors, Sparkles, X } from 'lucide-react';
import { parseWhisperX } from '@/services/transcription/whisperx';
import { services } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useTranscription } from '@/hooks/useTranscription';
import { useChapters } from '@/hooks/useChapters';
import { cn, formatDate, formatDuration, formatTimestamp } from '@/lib/format';
import { ErrorState, Skeleton, StatusBadge } from '@/components/ui';
import { ChatPanel } from '@/features/chat/ChatPanel';
import type { Lecture, TimeSelection, Transcript } from '@/types/domain';
import { PlaybackProvider, usePlaybackStore } from './playback';
import { VideoPlayer } from './VideoPlayer';
import { TranscriptViewer, type TranscriptPanelView } from './TranscriptViewer';
import { TranscriptionStatusPanel } from './TranscriptionStatusPanel';
import { LectureMaterials, PdfViewer, type OpenPdf } from './LectureMaterials';

export function LecturePage() {
  const { lectureId = '' } = useParams();
  const lecture = useAsync(() => services.courses.getLecture(lectureId), [lectureId]);

  if (lecture.error) return <div className="mx-auto max-w-4xl p-8"><div className="card"><ErrorState error={lecture.error} onRetry={lecture.retry} /></div></div>;
  if (!lecture.data || lecture.data.id !== lectureId) return <LectureSkeleton />;

  // Re-mount per lecture so playback state starts fresh.
  return (
    <PlaybackProvider key={lecture.data.id} fallbackDuration={lecture.data.durationSec}>
      <LectureView lecture={lecture.data} />
    </PlaybackProvider>
  );
}

function LectureView({ lecture }: { lecture: Lecture }) {
  const store = usePlaybackStore();
  const course = useAsync(() => services.courses.getCourse(lecture.courseId), [lecture.courseId]);
  const siblings = useAsync(() => services.courses.listLectures(lecture.courseId), [lecture.courseId]);
  const { job, transcript: remoteTranscript, error, retry } = useTranscription(lecture.id);
  const local = useLocalFiles(lecture.id);
  const transcript = local.transcript ?? remoteTranscript;
  const videoSrc = local.video?.url ?? lecture.videoUrl;
  const chapters = useChapters(transcript);
  const [panelView, setPanelView] = useState<TranscriptPanelView>('transcript');
  const panelRef = useRef<HTMLDivElement>(null);
  const materials = useAsync(() => services.materials.listMaterials(lecture.id), [lecture.id]);
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  // [PDF p. N] citations from the assistant open the slides (or the first PDF) at that page.
  const openPdfPage = (page: number) => {
    const list = materials.data ?? [];
    const material = list.find((m) => m.kind === 'slides') ?? list[0];
    if (material) setPdf({ material, page });
  };

  // Segment selection shared by the transcript, the seek bar and the chat.
  const [selection, setSelection] = useState<TimeSelection | null>(null);
  const [askSignal, setAskSignal] = useState(0);
  const askAbout = (sel: TimeSelection) => {
    setSelection(sel);
    setChatOpen(true);
    setAskSignal((n) => n + 1);
  };
  const playSelection = usePlaySelection(selection);

  const showChapters = () => {
    setPanelView('chapters');
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const [dragging, setDragging] = useState(false);

  // When a local video is loaded, leave "simulated" mode and start from the beginning.
  useEffect(() => {
    if (local.video) store._set({ mode: 'video', videoError: undefined, currentTime: 0, playing: false });
  }, [local.video, store]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void local.load(e.dataTransfer.files);
  };
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const [params, setParams] = useSearchParams();

  // Deep link: /lectures/:id?t=123 (used by chat citations across lectures)
  useEffect(() => {
    const t = Number(params.get('t'));
    if (t > 0) {
      store.seek(t);
      setParams({}, { replace: true });
    }
  }, [params, setParams, store]);

  const ordered = [...(siblings.data ?? [])].sort((a, b) => a.number - b.number);
  const prev = ordered.find((l) => l.number === lecture.number - 1);
  const next = ordered.find((l) => l.number === lecture.number + 1);
  const transcriptEnd = transcript ? Math.ceil(transcript.segments.at(-1)!.end + 5) : undefined;

  return (
    <div className="flex min-h-full lg:h-full">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 text-center">
            <div><FileUp className="mx-auto size-8 text-brand-600" /><p className="mt-2 font-medium text-brand-700">Drop a video and/or a WhisperX .json</p></div>
          </div>
        )}
        {/* Header */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <nav className="flex items-center gap-1 text-[12.5px] text-slate-500">
              <Link to="/" className="hover:text-slate-800">Dashboard</Link>
              <ChevronRight className="size-3" />
              <Link to={`/courses/${lecture.courseId}`} className="truncate hover:text-slate-800">{course.data?.name ?? '…'}</Link>
            </nav>
            <h1 className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">
              <span className="mr-2 text-slate-400 tabular">L{String(lecture.number).padStart(2, '0')}</span>{lecture.title}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <input ref={local.inputRef} type="file" multiple accept="video/*,.json,application/json" className="hidden" onChange={(e) => { if (e.target.files?.length) void local.load(e.target.files); e.target.value = ''; }} />
            <button onClick={() => local.inputRef.current?.click()} title="Load a local video and/or WhisperX transcript (or drag & drop)" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <FileUp className="size-3.5" /><span className="hidden sm:inline">Load files</span>
            </button>
            <NavArrow to={prev && `/lectures/${prev.id}`} label="Previous lecture"><ChevronLeft className="size-4" /></NavArrow>
            <NavArrow to={next && `/lectures/${next.id}`} label="Next lecture"><ChevronRight className="size-4" /></NavArrow>
            <button
              onClick={() => setChatOpen((o) => !o)}
              aria-pressed={chatOpen}
              className={cn('ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-sm transition', chatOpen ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
            >
              <Sparkles className="size-3.5" /> Ask AI
            </button>
          </div>
        </header>

        {/* Video + transcript */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:px-6">
          {(local.video || local.transcript || local.error) && (
            <div className={cn('mx-auto flex w-full max-w-5xl shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]', local.error ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700')}>
              {local.error ? <AlertCircle className="size-4 shrink-0" /> : <FileUp className="size-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">
                {local.error ?? `Using local files (not uploaded anywhere): ${[local.video?.name, local.transcriptName].filter(Boolean).join(' · ')}`}
              </span>
              <button onClick={local.error ? local.dismiss : local.reset} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium hover:bg-white/60"><X className="size-3.5" />{local.error ? 'Dismiss' : 'Reset'}</button>
            </div>
          )}
          <div className="mx-auto w-full shrink-0" style={{ maxWidth: 'min(100%, calc(52vh * 16 / 9))' }}>
            <VideoPlayer src={videoSrc} title={lecture.title} simulatedDuration={transcriptEnd} chapters={chapters.chapters} onShowChapters={showChapters} selection={selection} onSelectRange={askAbout} />
            {selection && <SelectionBar selection={selection} onPlay={playSelection} onAsk={() => askAbout(selection)} onClear={() => setSelection(null)} />}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{formatDate(lecture.recordedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />{formatDuration(lecture.durationSec)}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />Room {lecture.room}</span>
              <span className="ml-auto"><StatusBadge job={job} /></span>
            </div>
          </div>
          <div ref={panelRef} className="mx-auto h-[60vh] w-full max-w-5xl lg:h-auto lg:min-h-[240px] lg:flex-1">
            {transcript ? <TranscriptViewer transcript={transcript} chapters={chapters} view={panelView} onViewChange={setPanelView} selection={selection} onAsk={askAbout} /> : <TranscriptionStatusPanel job={job} error={error} onRetry={retry} />}
          </div>
        </div>
      </div>

      {/* Chat: side panel on desktop, sheet on mobile — never covers the video or transcript on large screens */}
      {chatOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setChatOpen(false)} />
          <aside className="fixed inset-x-0 bottom-0 z-40 h-[78dvh] overflow-hidden rounded-t-2xl border-t border-slate-200 shadow-2xl lg:static lg:z-auto lg:h-auto lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none xl:w-[380px]">
            <ChatPanel
              lecture={lecture}
              onClose={() => setChatOpen(false)}
              onSeek={(t) => store.seek(t, { play: true })}
              onOpenPdf={openPdfPage}
              selection={selection}
              onClearSelection={() => setSelection(null)}
              askSignal={askSignal}
            />
          </aside>
        </>
      )}

      <LectureMaterials materials={materials.data} loading={materials.loading} onOpen={setPdf} />
      {pdf && <PdfViewer open={pdf} onClose={() => setPdf(null)} onPage={(page) => setPdf({ ...pdf, page })} />}
    </div>
  );
}

/** The selected part of the lecture, under the video: play it, ask about it, or clear it. */
function SelectionBar({ selection, onPlay, onAsk, onClear }: { selection: TimeSelection; onPlay: () => void; onAsk: () => void; onClear: () => void }) {
  const len = selection.end - selection.start;
  return (
    <div className="mt-2.5 flex animate-fade-in items-center gap-2 rounded-lg bg-amber-50 py-1.5 pl-2.5 pr-1.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200/70">
      <Scissors className="size-3.5 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono font-semibold">{formatTimestamp(selection.start)}–{formatTimestamp(selection.end)}</span>
        <span className="text-amber-700/80"> · {len < 60 ? `${Math.round(len)} s` : `${Math.floor(len / 60)} min ${Math.round(len % 60)} s`} selected</span>
        {selection.text && <span className="hidden text-amber-700/80 md:inline"> · “{selection.text}”</span>}
      </span>
      <button onClick={onPlay} title="Play only the selected part" className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium hover:bg-amber-100"><Play className="size-3 fill-current" />Play</button>
      <button onClick={onAsk} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-400 px-2.5 font-semibold text-slate-900 hover:bg-amber-300"><Sparkles className="size-3.5" />Ask AI</button>
      <button onClick={onClear} aria-label="Clear selection" className="grid size-7 place-items-center rounded-md text-amber-700 hover:bg-amber-100"><X className="size-3.5" /></button>
    </div>
  );
}

/** "Play selection": plays from the start and pauses at the end (unless the student seeks away). */
function usePlaySelection(selection: TimeSelection | null) {
  const store = usePlaybackStore();
  const stop = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    stop.current = null;
    return store.subscribe(() => {
      const r = stop.current;
      if (!r) return;
      const { currentTime: t, playing } = store.get();
      if (t < r.start - 1 || t > r.end + 1) stop.current = null; // seeked elsewhere
      else if (playing && t >= r.end) { stop.current = null; store.pause(); }
    });
  }, [selection, store]);
  return () => {
    if (!selection) return;
    stop.current = { start: selection.start, end: selection.end };
    store.seek(selection.start, { play: true });
  };
}

/** Video/transcript files picked from the user's disk. Kept in memory only (object URLs), never sent anywhere. */
function useLocalFiles(lectureId: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<{ url: string; name: string }>();
  const [transcript, setTranscript] = useState<Transcript>();
  const [transcriptName, setTranscriptName] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  async function load(files: FileList) {
    setError(undefined);
    for (const f of Array.from(files)) {
      if (f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name)) {
        setVideo({ url: URL.createObjectURL(f), name: f.name });
      } else if (f.name.toLowerCase().endsWith('.json')) {
        try {
          setTranscript(parseWhisperX(JSON.parse(await f.text()), lectureId));
          setTranscriptName(f.name);
        } catch (e) {
          setError(`${f.name}: ${e instanceof SyntaxError ? 'not valid JSON' : e instanceof Error ? e.message : 'could not read file'}`);
        }
      } else {
        setError(`${f.name}: unsupported file. Use a video (.mp4/.webm) or a WhisperX .json.`);
      }
    }
  }

  function reset() {
    setVideo(undefined);
    setTranscript(undefined);
    setTranscriptName(undefined);
    setError(undefined);
  }

  return { inputRef, video, transcript, transcriptName, error, load, reset, dismiss: () => setError(undefined) };
}

function NavArrow({ to, label, children }: { to?: string; label: string; children: React.ReactNode }) {
  const cls = 'grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm';
  return to ? (
    <Link to={to} aria-label={label} title={label} className={cn(cls, 'hover:bg-slate-50 hover:text-slate-900')}>{children}</Link>
  ) : (
    <span aria-disabled className={cn(cls, 'opacity-40')}>{children}</span>
  );
}

function LectureSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-2 h-6 w-80" />
      <Skeleton className="mx-auto mt-6 aspect-video w-full max-w-4xl rounded-xl" />
    </div>
  );
}
