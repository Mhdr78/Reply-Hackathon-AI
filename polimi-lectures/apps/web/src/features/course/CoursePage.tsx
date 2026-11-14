import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, ChevronRight, Clock, Globe2, MapPin, PlayCircle, Search, Users, VideoOff } from 'lucide-react';
import { services } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { useTranscriptionStatus } from '@/hooks/useTranscription';
import { formatDate, formatDuration } from '@/lib/format';
import { EmptyState, ErrorState, Input, Skeleton, StatusBadge } from '@/components/ui';
import type { Course, Lecture } from '@/types/domain';

export function CoursePage() {
  const { courseId = '' } = useParams();
  const course = useAsync(() => services.courses.getCourse(courseId), [courseId]);
  const lectures = useAsync(() => services.courses.listLectures(courseId), [courseId]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lectures.data ?? []).filter((l) => !q || l.title.toLowerCase().includes(q) || String(l.number) === q);
  }, [lectures.data, query]);

  if (course.error) return <div className="mx-auto max-w-5xl p-8"><div className="card"><ErrorState error={course.error} onRetry={course.retry} /></div></div>;

  const c = course.data;
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <nav className="flex items-center gap-1 text-[13px] text-slate-500">
        <Link to="/" className="hover:text-slate-800">Dashboard</Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-slate-800">{c?.name ?? '…'}</span>
      </nav>

      {!c ? <HeaderSkeleton /> : <CourseHeader course={c} />}

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">
            Lecture recordings {lectures.data && <span className="ml-1 font-normal text-slate-400 tabular">{lectures.data.length}</span>}
          </h2>
          {!!lectures.data?.length && (
            <div className="w-full sm:w-64"><Input icon={<Search className="size-4" />} placeholder="Search lectures…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search lectures" /></div>
          )}
        </div>

        <div className="card mt-4 overflow-hidden">
          {lectures.error ? (
            <ErrorState error={lectures.error} onRetry={lectures.retry} />
          ) : lectures.loading && !lectures.data ? (
            <div className="divide-y divide-slate-100">{Array.from({ length: 4 }, (_, i) => <div key={i} className="p-4"><Skeleton className="h-10" /></div>)}</div>
          ) : !lectures.data?.length ? (
            <EmptyState icon={<VideoOff className="size-5" />} title="No recordings yet">
              Recordings for this course will appear here once they are published by the lecturer.
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Search className="size-5" />} title="No lectures match your search" />
          ) : (
            <ul className="divide-y divide-slate-100">{filtered.map((l) => <LectureRow key={l.id} lecture={l} color={c?.color} />)}</ul>
          )}
        </div>
      </section>
    </div>
  );
}

function CourseHeader({ course: c }: { course: Course }) {
  const info = [
    { icon: Users, label: 'Instructors', value: c.instructors.map((i) => i.name).join(', ') },
    { icon: CalendarClock, label: 'Schedule', value: c.schedule },
    { icon: MapPin, label: 'Campus', value: c.campus },
    { icon: Globe2, label: 'Language · Credits', value: `${c.language === 'en' ? 'English' : 'Italian'} · ${c.credits} CFU` },
  ];
  return (
    <header className="mt-5 animate-fade-in">
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        <span className="size-2.5 rounded-full" style={{ background: c.color }} />
        <span className="font-mono tabular">{c.code}</span>
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{c.name}</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600">{c.description}</p>
      <dl className="card mt-6 grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {info.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex gap-3 p-4">
            <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 text-[13.5px] font-medium">{value}</dd></div>
          </div>
        ))}
      </dl>
    </header>
  );
}

function LectureRow({ lecture: l, color }: { lecture: Lecture; color?: string }) {
  const job = useTranscriptionStatus(l.id);
  return (
    <li>
      <Link to={`/lectures/${l.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular" style={{ background: `${color}14`, color }}>{String(l.number).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-medium group-hover:text-brand-700">{l.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-slate-500">
            <span>{formatDate(l.recordedAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span className="inline-flex items-center gap-1 tabular"><Clock className="size-3" />{formatDuration(l.durationSec)}</span>
            <span className="hidden sm:inline">Room {l.room}</span>
          </div>
          <div className="mt-2 sm:hidden"><StatusBadge job={job} /></div>
        </div>
        <div className="hidden sm:block"><StatusBadge job={job} /></div>
        <PlayCircle className="size-6 shrink-0 text-slate-300 transition group-hover:text-brand-600" />
      </Link>
    </li>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mt-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="mt-6 h-20 w-full" />
    </div>
  );
}
