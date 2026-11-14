import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clapperboard, GraduationCap, Search, SearchX, Users } from 'lucide-react';
import { services } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/features/auth/AuthContext';
import { formatDate } from '@/lib/format';
import { EmptyState, ErrorState, Input, Skeleton } from '@/components/ui';
import type { Course } from '@/types/domain';

type Sort = 'recent' | 'name' | 'recordings';

export function DashboardPage() {
  const { student } = useSession();
  const { data, loading, error, retry } = useAsync(() => services.courses.listCourses(student.academicTerm.id), [student.academicTerm.id]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data ?? []).filter((c) => !q || [c.name, c.code, ...c.instructors.map((i) => i.name)].some((s) => s.toLowerCase().includes(q)));
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'recordings' ? b.recordingCount - a.recordingCount : (b.lastRecordingAt ?? '').localeCompare(a.lastRecordingAt ?? ''),
    );
  }, [data, query, sort]);

  const totalRecordings = data?.reduce((n, c) => n + c.recordingCount, 0) ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">{greeting},</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{student.firstName} {student.lastName}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4" />{student.programme}</span>
          </p>
        </div>
        <span className="inline-flex h-8 items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm sm:self-auto">
          <CalendarDays className="size-4 text-brand-600" />{student.academicTerm.label}
        </span>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Courses this term" value={data?.length} />
        <Stat label="Recorded lectures" value={data && totalRecordings} />
        <Stat className="col-span-2 sm:col-span-1" label="Credits (CFU)" value={data?.reduce((n, c) => n + c.credits, 0)} />
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">Your courses</h2>
          <div className="flex gap-2">
            <div className="w-full sm:w-72">
              <Input icon={<Search className="size-4" />} placeholder="Search courses, codes, instructors…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort courses" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100">
              <option value="recent">Latest recording</option>
              <option value="name">Name</option>
              <option value="recordings">Most recordings</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          {error ? (
            <div className="card"><ErrorState error={error} onRetry={retry} /></div>
          ) : loading && !data ? (
            <Grid>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[188px] rounded-xl" />)}</Grid>
          ) : courses.length === 0 ? (
            <div className="card"><EmptyState icon={<SearchX className="size-5" />} title="No courses match your search">Try a different name, course code or instructor.</EmptyState></div>
          ) : (
            <Grid>{courses.map((c) => <CourseCard key={c.id} course={c} />)}</Grid>
          )}
        </div>
      </section>
    </div>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;

function Stat({ label, value, className }: { label: string; value?: number; className?: string }) {
  return (
    <div className={`card px-4 py-3.5 ${className ?? ''}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      {value == null ? <Skeleton className="mt-2 h-6 w-10" /> : <div className="mt-1 text-xl font-semibold tabular">{value}</div>}
    </div>
  );
}

function CourseCard({ course: c }: { course: Course }) {
  return (
    <Link to={`/courses/${c.id}`} className="card group relative flex min-h-[188px] flex-col gap-0 overflow-hidden p-5 [&>div:last-child]:mt-auto [&>p]:mb-5transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: c.color }} />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono tabular">{c.code}</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium">{c.credits} CFU</span>
      </div>
      <h3 className="mt-3 text-[15.5px] font-semibold leading-snug tracking-tight group-hover:text-brand-700">{c.name}</h3>
      <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-slate-500">
        <Users className="mt-0.5 size-3.5 shrink-0" />
        <span className="line-clamp-1">{c.instructors.map((i) => i.name).join(', ')}</span>
      </p>
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3.5 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <Clapperboard className="size-4 text-slate-400" />
          {c.recordingCount} {c.recordingCount === 1 ? 'recording' : 'recordings'}
        </span>
        <span className="text-slate-400">{c.lastRecordingAt ? `Last ${formatDate(c.lastRecordingAt, { day: 'numeric', month: 'short' })}` : 'None yet'}</span>
      </div>
    </Link>
  );
}
