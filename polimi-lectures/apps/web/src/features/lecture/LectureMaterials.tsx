import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Presentation, X } from 'lucide-react';
import { cn } from '@/lib/format';
import { Skeleton } from '@/components/ui';
import { SidebarSection } from '@/components/SidebarSlot';
import type { LectureMaterial } from '@/types/domain';
import { usePlayback } from './playback';

export interface OpenPdf { material: LectureMaterial; page: number }

const KIND_LABEL: Record<NonNullable<LectureMaterial['kind']>, string> = { slides: 'Slides', notes: 'Notes', exercises: 'Exercises', other: 'Document' };

/** "Lecture materials" section in the left sidebar. */
export function LectureMaterials({ materials, loading, onOpen }: { materials?: LectureMaterial[]; loading: boolean; onOpen: (o: OpenPdf) => void }) {
  return (
    <SidebarSection>
      {({ collapsed, expand }) =>
        collapsed ? (
          <div className="space-y-0.5 border-t border-slate-100 pt-3">
            {materials?.map((m) => (
              <button key={m.id} onClick={() => onOpen({ material: m, page: 1 })} title={m.title} aria-label={`Open ${m.title}`} className="flex h-9 w-full items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <MaterialIcon material={m} className="size-4" />
              </button>
            ))}
            {!materials?.length && !loading && <button onClick={expand} title="Lecture materials" className="flex h-9 w-full items-center justify-center rounded-lg text-slate-300"><FileText className="size-4" /></button>}
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-1.5 flex items-center justify-between px-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lecture materials</span>
              {!!materials?.length && <span className="rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 tabular">{materials.length}</span>}
            </div>
            {loading && !materials && <div className="space-y-2 px-2.5 py-1"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
            {materials && !materials.length && <p className="px-2.5 py-1 text-[12.5px] leading-relaxed text-slate-400">No PDFs for this lecture yet.</p>}
            <ul className="space-y-0.5">
              {materials?.map((m) => <MaterialRow key={m.id} material={m} onOpen={onOpen} />)}
            </ul>
          </div>
        )
      }
    </SidebarSection>
  );
}

function MaterialIcon({ material, className }: { material: LectureMaterial; className?: string }) {
  return material.kind === 'slides' ? <Presentation className={className} /> : <FileText className={className} />;
}

function MaterialRow({ material: m, onOpen }: { material: LectureMaterial; onOpen: (o: OpenPdf) => void }) {
  // The page linked to the current playback position, if any (from the manifest's time → page links).
  const nowPage = usePlayback((s) => m.links?.find((l) => s.currentTime >= l.start && s.currentTime < l.end)?.page ?? 0);
  return (
    <li>
      <button onClick={() => onOpen({ material: m, page: nowPage || 1 })} title={m.description ?? m.fileName} className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100">
        <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-md', m.kind === 'slides' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600')}>
          <MaterialIcon material={m} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[13px] font-medium leading-snug text-slate-700 group-hover:text-slate-900">{m.title}</span>
          <span className="block text-[11.5px] text-slate-400">{KIND_LABEL[m.kind ?? 'other']} · PDF</span>
        </span>
      </button>
      {nowPage > 0 && (
        <button onClick={() => onOpen({ material: m, page: nowPage })} className="mb-1 ml-[46px] inline-flex animate-fade-in items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11.5px] font-medium text-amber-800 ring-1 ring-amber-100 hover:bg-amber-100" title="The page that matches what the lecturer is saying now">
          <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />Now: p. {nowPage}
        </button>
      )}
    </li>
  );
}

/** In-app PDF viewer (uses the browser's built-in PDF renderer, which supports #page=N). */
export function PdfViewer({ open, onClose, onPage }: { open: OpenPdf; onClose: () => void; onPage: (page: number) => void }) {
  const { material, page } = open;
  const [input, setInput] = useState(String(page));
  useEffect(() => setInput(String(page)), [page]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const src = `${material.url}#page=${page}&view=FitH`;
  const btn = 'grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:p-6" onClick={onClose} role="dialog" aria-modal aria-label={material.title}>
      <div className="flex h-full w-full max-w-6xl animate-fade-in flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', material.kind === 'slides' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600')}><MaterialIcon material={material} className="size-4" /></span>
          <div className="mr-auto min-w-0">
            <div className="truncate text-[14px] font-semibold">{material.title}</div>
            <div className="truncate text-[11.5px] text-slate-500">{material.fileName}</div>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5">
            <button className={cn(btn, 'size-7')} aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}><ChevronLeft className="size-4" /></button>
            <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(input, 10); if (n > 0) onPage(n); }} className="flex items-center gap-1 px-1 text-[12.5px] text-slate-500">
              p.<input value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} aria-label="Page" className="h-6 w-9 rounded border border-slate-200 text-center text-[12.5px] text-slate-800 tabular outline-none focus:border-brand-500" />
            </form>
            <button className={cn(btn, 'size-7')} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></button>
          </div>
          <a href={src} target="_blank" rel="noreferrer" className={btn} title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink className="size-4" /></a>
          <a href={material.url} download={material.fileName} className={btn} title="Download" aria-label="Download"><Download className="size-4" /></a>
          <button onClick={onClose} className={btn} aria-label="Close (Esc)" title="Close (Esc)"><X className="size-4" /></button>
        </header>
        {/* key: the browser viewer ignores hash changes after load, so remount per page */}
        <iframe key={src} src={src} title={material.title} className="min-h-0 w-full flex-1 bg-slate-100" />
      </div>
    </div>
  );
}
