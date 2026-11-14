import { http } from '@/lib/http';
import type { Session } from '@/types/domain';
import type { AuthProvider, LoginStep } from './AuthProvider';

/** Talks to the backend, which brokers Polimi SSO + MFA and sets an httpOnly session cookie. See docs/API.md. */
export const httpAuthProvider: AuthProvider = {
  startLogin: (personCode, password) =>
    http<LoginStep>('/auth/login', { method: 'POST', body: JSON.stringify({ personCode, password }) }),
  verifyOtp: (challengeId, code) =>
    http<Session>('/auth/otp', { method: 'POST', body: JSON.stringify({ challengeId, code }) }),
  restoreSession: () => http<Session>('/auth/session').catch(() => null),
  logout: () => http<void>('/auth/logout', { method: 'POST' }),
};
