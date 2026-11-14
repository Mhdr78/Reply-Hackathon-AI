import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth, useSession } from '@/features/auth/AuthContext';
import { services } from '@/services';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/format';
import { Logo } from './Logo';
import { Skeleton } from './ui';
import { SidebarSlotContext } from './SidebarSlot';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorageGet('sidebar.collapsed') === '1');
  const { pathname } = useLocation();
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { localStorageSet('sidebar.collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  // Page-provided sidebar content goes into the mobile drawer when it is open, otherwise into the desktop sidebar.
  const [desktopSlot, setDesktopSlot] = useState<HTMLElement | null>(null);
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);
  const slot = {
    target: (mobileOpen && mobileSlot) || desktopSlot,
    collapsed: mobileOpen ? false : collapsed,
    expand: () => setCollapsed(false),
  };

  return (
    <SidebarSlotContext.Provider value={slot}>
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className={cn('hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 lg:block', collapsed ? 'w-[68px]' : 'w-[256px]')}>
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} slotRef={setDesktopSlot} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[272px] animate-fade-in bg-white shadow-xl">
            <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
            <SidebarContent collapsed={false} slotRef={setMobileSlot} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"><Menu className="size-5" /></button>
          <Link to="/" className="flex items-center gap-2 font-semibold"><Logo className="size-6" />Polimi Lectures</Link>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </SidebarSlotContext.Provider>
  );
}

function SidebarContent({ collapsed, onToggle, slotRef }: { collapsed: boolean; onToggle?: () => void; slotRef: (el: HTMLElement | null) => void }) {
  const { student } = useSession();
  const { logout } = useAuth();
  const courses = useAsync(() => services.courses.listCourses(student.academicTerm.id), [student.academicTerm.id]);
  const initials = `${student.firstName[0]}${student.lastName[0]}`;
  const item = (active: boolean) =>
    cn('flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors', active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900', collapsed && 'justify-center px-0');

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-2.5 px-5', collapsed && 'justify-center px-0')}>
        <Logo className="size-7 shrink-0" />
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Polimi Lectures</span>}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          <NavLink end to="/" className={({ isActive }) => item(isActive)} title="Dashboard">
            <LayoutGrid className="size-4 shrink-0" />{!collapsed && 'Dashboard'}
          </NavLink>
        </div>

        <div>
          {!collapsed && <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">My courses</div>}
          <div className="space-y-0.5">
            {courses.loading && !courses.data
              ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="mx-2.5 my-2 h-5" />)
              : courses.data?.map((c) => (
                  <NavLink key={c.id} to={`/courses/${c.id}`} className={({ isActive }) => item(isActive)} title={c.name}>
                    <span className="grid size-4 shrink-0 place-items-center"><span className="size-2 rounded-full" style={{ background: c.color }} /></span>
                    {!collapsed && <span className="truncate">{c.name}</span>}
                  </NavLink>
                ))}
          </div>
        </div>

        {/* Page-specific section (e.g. lecture materials) */}
        <div ref={slotRef} className="empty:hidden" />
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className={cn('flex items-center gap-2.5 rounded-lg p-1.5', collapsed && 'flex-col')}>
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white" title={`${student.firstName} ${student.lastName}`}>{initials}</div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium">{student.firstName} {student.lastName}</div>
              <div className="truncate text-xs text-slate-500 tabular">{student.personCode}</div>
            </div>
          )}
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut className="size-4" /></button>
        </div>
        {onToggle && (
          <button onClick={onToggle} className={cn(item(false), 'mt-1 w-full text-slate-400')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" />Collapse</>}
          </button>
        )}
      </div>
    </div>
  );
}

function localStorageGet(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localStorageSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
