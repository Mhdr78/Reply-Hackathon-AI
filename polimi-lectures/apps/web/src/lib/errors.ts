/** Centralized error model: every service throws AppError, the UI only renders AppError. */
export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_OTP'
  | 'OTP_EXPIRED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'TRANSCRIPTION_FAILED'
  | 'BAD_REQUEST'
  | 'NOT_PREPARED'
  | 'NOT_GENERATED'
  | 'LLM_FAILED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_CREDENTIALS: 'Invalid person code or password.',
  INVALID_OTP: 'The verification code is not valid.',
  OTP_EXPIRED: 'The verification session expired. Please sign in again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  NOT_FOUND: 'The requested resource was not found.',
  NETWORK: 'Cannot reach the server. Check your connection and try again.',
  TRANSCRIPTION_FAILED: 'The transcription could not be generated.',
  BAD_REQUEST: 'The request was not valid.',
  NOT_PREPARED: 'The assistant is not set up for this lecture yet.',
  NOT_GENERATED: 'This has not been generated yet.',
  LLM_FAILED: 'The AI model could not answer. Please try again.',
  SERVICE_UNAVAILABLE: 'The service is not reachable right now.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly status?: number,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof TypeError) return new AppError('NETWORK');
  return new AppError('UNKNOWN', err instanceof Error ? err.message : undefined);
}
