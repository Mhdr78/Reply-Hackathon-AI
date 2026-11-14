import type { Session } from '@/types/domain';

/**
 * Authentication contract. The UI depends only on this interface.
 *
 * A real implementation must delegate to Polimi's official SSO (e.g. SAML/OIDC via a backend),
 * including its MFA step. Credentials go straight to the institutional IdP / backend over HTTPS
 * and are never persisted by the frontend.
 */
export type LoginStep =
  | { type: 'otp_required'; challengeId: string; method: 'authenticator' | 'sms' | 'email'; hint?: string }
  | { type: 'authenticated'; session: Session };

export interface AuthProvider {
  startLogin(personCode: string, password: string): Promise<LoginStep>;
  verifyOtp(challengeId: string, code: string): Promise<Session>;
  /** Restore an existing session (e.g. from an httpOnly cookie) or return null. */
  restoreSession(): Promise<Session | null>;
  logout(): Promise<void>;
}
