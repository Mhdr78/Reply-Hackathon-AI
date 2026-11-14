import { Component, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CoursePage } from '@/features/course/CoursePage';
import { LecturePage } from '@/features/lecture/LecturePage';
import { Button, EmptyState } from '@/components/ui';
import { Compass, Bug } from 'lucide-react';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route index element={<DashboardPage />} />
              <Route path="courses/:courseId" element={<CoursePage />} />
              <Route path="lectures/:lectureId" element={<LecturePage />} />
              <Route path="*" element={<EmptyState icon={<Compass className="size-5" />} title="Page not found" action={<Link to="/"><Button variant="secondary" size="sm">Back to dashboard</Button></Link>} />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

/** Last-resort boundary for unexpected render errors. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error); // hook up error reporting (e.g. Sentry) here
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center">
        <EmptyState icon={<Bug className="size-5" />} title="Something went wrong" action={<Button onClick={() => location.assign('/')}>Reload</Button>}>
          {this.state.error.message}
        </EmptyState>
      </div>
    );
  }
}
