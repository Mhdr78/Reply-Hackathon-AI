import { config } from '@/config';
import { AppError, type ErrorCode } from './errors';

let tokenGetter: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

/** Called once by the auth layer so every request carries the bearer token. */
export function configureHttp(opts: { getToken: () => string | null; onUnauthorized: () => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

/** JSON request against the main backend (VITE_API_BASE_URL). */
export function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  return httpAt<T>(config.apiBaseUrl, path, init);
}

/** JSON request against any base URL (e.g. the chatbot server). Throws AppError. */
export async function httpAt<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenGetter();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: ErrorCode; message?: string };
    if (res.status === 401) onUnauthorized();
    const code: ErrorCode = body.code ?? (res.status === 401 ? 'UNAUTHORIZED' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN');
    throw new AppError(code, body.message, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
