import { AlertTriangle, AudioLines, Check, RotateCw } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { cn } from '@/lib/format';
import type { AppError } from '@/lib/errors';
import type { TranscriptionJob } from '@/types/domain';

const STEPS = [
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Transcribing' },
  { key: 'completed', label: 'Ready' },
] as const;

/** Shown in place of the transcript while it is not available. */
export function TranscriptionStatusPanel({ job, error, onRetry }: { job?: TranscriptionJob; error?: AppError; onRetry: () => void }) {
  if (error || job?.status === 'failed') {
    return (
      <Shell>
        <div className="grid size-11 place-items-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="size-5" /></div>
        <h3 className="mt-4 text-[15px] font-semibold">Transcription failed</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{job?.error ?? error?.message}</p>
        <Button className="mt-5" variant="secondary" size="sm" onClick={onRetry}><RotateCw className="size-3.5" />Retry transcription</Button>
      </Shell>
    );
  }

  if (!job || job.status === 'completed') {
    return (
      <div className="card h-full space-y-4 p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3"><Skeleton className="h-4 w-12" /><Skeleton className={cn('h-4', i % 2 ? 'w-3/4' : 'w-full')} /></div>
        ))}
      </div>
    );
  }

  const stepIdx = job.status === 'queued' ? 0 : job.status === 'processing' ? 1 : -1;
  const pct = Math.round((job.progress ?? 0) * 100);
  return (
    <Shell>
      <div className="relative grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <AudioLines className="size-5 animate-pulse" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold">{job.status === 'not_started' ? 'Starting transcription…' : 'Generating transcript'}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        This lecture hasn't been transcribed yet. You can start watching — the transcript will appear here automatically when it's ready.
      </p>
      <ol className="mt-6 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium ring-1 ring-inset', i < stepIdx ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : i === stepIdx ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-400 ring-slate-200')}>
              {i < stepIdx && <Check className="size-3" />}{s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-slate-200" />}
          </li>
        ))}
      </ol>
      {job.status === 'processing' && (
        <div className="mt-5 w-full max-w-xs">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1.5 text-xs text-slate-500 tabular">{pct}%</div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="card flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">{children}</div>;
}
