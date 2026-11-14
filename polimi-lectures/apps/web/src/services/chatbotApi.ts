import { config } from '@/config';
import { AppError, toAppError } from '@/lib/errors';
import { httpAt } from '@/lib/http';

/** JSON request to the chatbot server (services/chatbot), proxied by Vite at config.chatbotUrl. */
export async function chatbotCall<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await httpAt<T>(`${config.chatbotUrl}/api`, path, init);
  } catch (e) {
    const err = toAppError(e);
    // Proxy errors (server not running) come back as 5xx without our JSON error body.
    if (err.code === 'NETWORK' || (err.code === 'UNKNOWN' && (err.status ?? 500) >= 500)) {
      throw new AppError('SERVICE_UNAVAILABLE', 'The assistant server is not running. Start it with `npm run chatbot` from the repository root.');
    }
    throw err;
  }
}
