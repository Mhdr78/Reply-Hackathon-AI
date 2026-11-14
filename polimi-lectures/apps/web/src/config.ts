/** Environment-based configuration. Only VITE_* variables are exposed to the browser — never put secrets here. */
const env = import.meta.env;

export const config = {
  useMocks: env.VITE_USE_MOCKS !== 'false',
  apiBaseUrl: env.VITE_API_BASE_URL ?? '/api',
  lectureVideoUrl: env.VITE_LECTURE_VIDEO_URL ?? '/media/sample-lecture.mp4',
  /**
   * Base URL of the lecture chatbot server (services/chatbot). The Vite dev server proxies /chatbot-api to it.
   * Set to an empty string to use the in-browser mock assistant instead.
   */
  chatbotUrl: env.VITE_CHATBOT_URL ?? '/chatbot-api',
  mockLatencyMs: Number(env.VITE_MOCK_LATENCY_MS ?? 450),
  mockTranscriptionMs: Number(env.VITE_MOCK_TRANSCRIPTION_MS ?? 9000),
} as const;
