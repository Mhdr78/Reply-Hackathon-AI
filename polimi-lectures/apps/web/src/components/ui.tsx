/** Small reusable UI primitives. */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, RotateCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/format';
import type { AppError } from '@/lib/errors';
import type { TranscriptionJob, TranscriptionStatus } from '@/types/domain';

type Variant = 'primary' | 'secondary' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/60',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }>(
  ({ variant = 'primary', loading, size = 'md', className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; invalid?: boolean }>(
  ({ icon, invalid, className, ...rest }, ref) => (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{icon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4',
          invalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-brand-500 focus:ring-brand-100',
          !!icon && 'pl-9',
          className,
        )}
        {...rest}
      />
    </div>
  ),
);

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-5 text-red-500" />}
      title="Couldn't load this"
      action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RotateCw className="size-3.5" />Try again</Button>}
    >
      {error.message}
    </EmptyState>
  );
}

const statusMeta: Record<TranscriptionStatus, { label: string; cls: string; icon: ReactNode }> = {
  not_started: { label: 'Not transcribed', cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: <CircleDashed className="size-3.5" /> },
  queued: { label: 'Queued', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <Clock className="size-3.5" /> },
  processing: { label: 'Processing', cls: 'bg-blue-50 text-blue-700 ring-blue-200', icon: <Loader2 className="size-3.5 animate-spin" /> },
  completed: { label: 'Transcript ready', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 className="size-3.5" /> },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 ring-red-200', icon: <XCircle className="size-3.5" /> },
};

export function StatusBadge({ job }: { job?: TranscriptionJob }) {
  if (!job) return <Skeleton className="h-6 w-28 rounded-full" />;
  const m = statusMeta[job.status];
  const pct = job.status === 'processing' && job.progress != null ? ` · ${Math.round(job.progress * 100)}%` : '';
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset tabular', m.cls)}>
      {m.icon}
      {m.label}
      {pct}
    </span>
  );
}
