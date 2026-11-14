import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { services } from '@/services';
import { configureHttp } from '@/lib/http';
import type { Session } from '@/types/domain';
import { FullPageSpinner } from '@/components/ui';

interface AuthState {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session) => void;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await services.auth.logout().catch(() => {});
    setSessionState(null);
  }, []);

  useEffect(() => {
    services.auth.restoreSession().then((s) => {
      setSessionState(s);
      setReady(true);
    });
  }, []);

  // Keep the HTTP client's token in sync synchronously (child effects may fire requests before ours).
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.accessToken ?? null;
  useState(() => configureHttp({ getToken: () => tokenRef.current, onUnauthorized: () => setSessionState(null) }));

  const value = useMemo(() => ({ session, ready, setSession: setSessionState, logout }), [session, ready, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Narrowed hook for pages behind RequireAuth. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('No session');
  return session;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
