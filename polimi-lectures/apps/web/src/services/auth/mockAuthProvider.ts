import { config } from '@/config';
import { AppError } from '@/lib/errors';
import { sleep, uid } from '@/lib/format';
import { mockStudent } from '@/mocks/courses';
import type { Session } from '@/types/domain';
import type { AuthProvider } from './AuthProvider';

/**
 * Mock provider — NO real authentication happens.
 * Accepts any 8-digit person code with a password of 6+ characters (password "wrongpass" fails, to demo errors),
 * then any 6-digit OTP except "000000". Only an opaque fake token is kept in sessionStorage; passwords and OTPs are never stored.
 */
const STORAGE_KEY = 'polimi.mock.session';
const challenges = new Map<string, { personCode: string; expires: number }>();

export const mockAuthProvider: AuthProvider = {
  async startLogin(personCode, password) {
    await sleep(config.mockLatencyMs + 300);
    if (!/^\d{8}$/.test(personCode) || password.length < 6 || password === 'wrongpass') {
      throw new AppError('INVALID_CREDENTIALS');
    }
    const challengeId = uid();
    challenges.set(challengeId, { personCode, expires: Date.now() + 5 * 60_000 });
    return { type: 'otp_required', challengeId, method: 'authenticator', hint: 'Enter the 6-digit code from your authenticator app.' };
  },

  async verifyOtp(challengeId, code) {
    await sleep(config.mockLatencyMs + 200);
    const ch = challenges.get(challengeId);
    if (!ch || ch.expires < Date.now()) throw new AppError('OTP_EXPIRED');
    if (!/^\d{6}$/.test(code) || code === '000000') throw new AppError('INVALID_OTP');
    challenges.delete(challengeId);
    const session: Session = {
      accessToken: `mock.${uid()}${uid()}`,
      expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
      student: mockStudent(ch.personCode),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  },

  async restoreSession() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Session;
      return new Date(s.expiresAt) > new Date() ? s : null;
    } catch {
      return null;
    }
  },

  async logout() {
    sessionStorage.removeItem(STORAGE_KEY);
  },
};
