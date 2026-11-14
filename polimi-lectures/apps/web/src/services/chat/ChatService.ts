import { config } from '@/config';
import { AppError } from '@/lib/errors';
import { chatbotCall } from '@/services/chatbotApi';
import { formatTimestamp, sleep, uid } from '@/lib/format';
import { mockLectures } from '@/mocks/courses';
import { buildMockTranscript } from '@/mocks/transcripts';
import type { ChatLectureStatus, ChatMessage, ChatThread, SendMessageRequest, SendMessageResponse, TranscriptSegment } from '@/types/domain';

/**
 * Chat contract: several persistent chats per lecture, each with its own memory for follow-up questions.
 * Independent of the transcription module: the chatbot server owns its own copy of the sources
 * (transcript + PDFs, prepared automatically by services/chatbot).
 */
export interface ChatService {
  readonly kind: 'server' | 'mock';
  getStatus(lectureId: string): Promise<ChatLectureStatus>;
  listChats(lectureId: string): Promise<ChatThread[]>;
  createChat(lectureId: string, title?: string): Promise<ChatThread>;
  getMessages(chatId: string): Promise<ChatMessage[]>;
  /** Asks a question (optionally about a selected time range). Both messages are persisted only on success. */
  sendMessage(chatId: string, req: SendMessageRequest): Promise<SendMessageResponse>;
  renameChat(chatId: string, title: string): Promise<ChatThread>;
  deleteChat(chatId: string): Promise<void>;
}

/* ---------------- HTTP adapter for the chatbot server (services/chatbot) ---------------- */

const call = chatbotCall;

export const httpChatService: ChatService = {
  kind: 'server',
  getStatus: async (lectureId) => {
    // The server prepares the lecture (transcript + slides) on first use, so this can take a moment the first time.
    const r = await call<{ lecture_id: string; prepared: boolean; pdf?: string; reason?: string }>(`/lectures/${encodeURIComponent(lectureId)}`);
    return { lectureId: r.lecture_id, prepared: r.prepared, pdf: r.pdf, reason: r.reason };
  },
  listChats: (lectureId) => call(`/lectures/${encodeURIComponent(lectureId)}/chats`),
  createChat: (lectureId, title) => call(`/lectures/${encodeURIComponent(lectureId)}/chats`, { method: 'POST', body: JSON.stringify({ title }) }),
  getMessages: (chatId) => call(`/chats/${chatId}/messages`),
  sendMessage: (chatId, req) => call(`/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(req) }),
  renameChat: (chatId, title) => call(`/chats/${chatId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteChat: (chatId) => call(`/chats/${chatId}`, { method: 'DELETE' }),
};

/* ---------------- Mock: keyword retrieval over mock transcripts, persisted in localStorage ---------------- */

const KEY = 'polimi.mock.chats.v2';
interface MockDb { chats: ChatThread[]; messages: Record<string, ChatMessage[]> }

function load(): MockDb {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as MockDb;
  } catch {
    return { chats: [], messages: {} };
  }
}
function save(db: MockDb) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or unavailable */ }
}
function thread(db: MockDb, id: string) {
  const c = db.chats.find((x) => x.id === id);
  if (!c) throw new AppError('NOT_FOUND', 'Chat not found.');
  return c;
}

const STOP = new Set('a an the is are was were be to of in on for and or what how why when where which who does do did can could i you we it this that these those about with from me my please explain tell lecture professor say said mean part more simply'.split(' '));
const tokenize = (s: string) => s.toLowerCase().match(/[a-zà-ù]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];
const range = (a: number, b: number) => `[${formatTimestamp(a)}-${formatTimestamp(b)}]`;

function mockAnswer(lectureId: string, req: SendMessageRequest, history: ChatMessage[]): string {
  const lecture = mockLectures.find((l) => l.id === lectureId);
  if (!lecture) throw new AppError('NOT_FOUND');
  const segs = buildMockTranscript(lecture).segments;
  const q = req.content.toLowerCase();
  const note = '\n\n_Mock assistant: keyword search over the transcript. Start the chatbot server for real answers._';
  const memory = history.length ? `\n\n_This chat remembers ${history.filter((m) => m.role === 'user').length} earlier question(s)._` : '';

  if (req.selection) {
    const { start, end } = req.selection;
    const inside = segs.filter((s) => s.start < end && s.end > start);
    if (!inside.length) throw new AppError('BAD_REQUEST', 'No spoken text overlaps that range.');
    return `In ${range(start, end)} the lecturer says:\n\n> ${inside.map((s) => s.text).join(' ')}\n\n` +
      `The key idea starts at [${formatTimestamp(inside[0].start)}].${memory}${note}`;
  }
  if (/summar|recap|overview|key concepts|tl;?dr/.test(q)) {
    const picks = [0.08, 0.3, 0.55, 0.8].map((f) => segs[Math.floor(f * (segs.length - 1))]);
    return `**Summary of this lecture**\n\n${picks.map((p) => `- [${formatTimestamp(p.start)}] ${p.text}`).join('\n')}${memory}${note}`;
  }
  const terms = tokenize(q);
  const scored = segs
    .map((s: TranscriptSegment) => ({ s, score: terms.reduce((n, t) => n + (tokenize(s.text).some((w) => w.startsWith(t.slice(0, 5))) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!scored.length) return `I couldn't find that in this lecture. Try rephrasing, or select a part of the video and ask about it.${memory}${note}`;
  return `These are the most relevant passages:\n\n${scored.map(({ s }) => `- [${formatTimestamp(s.start)}] ${s.text}`).join('\n')}${memory}${note}`;
}

export const mockChatService: ChatService = {
  kind: 'mock',
  async getStatus(lectureId) {
    return { lectureId, prepared: true };
  },
  async listChats(lectureId) {
    await sleep(config.mockLatencyMs / 2);
    return load().chats.filter((c) => c.lectureId === lectureId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async createChat(lectureId, title = 'New chat') {
    const db = load();
    const ts = new Date().toISOString();
    const chat: ChatThread = { id: uid() + uid(), lectureId, title, createdAt: ts, updatedAt: ts, messageCount: 0, preview: null };
    db.chats.push(chat);
    db.messages[chat.id] = [];
    save(db);
    return chat;
  },
  async getMessages(chatId) {
    await sleep(config.mockLatencyMs / 2);
    const db = load();
    thread(db, chatId);
    return db.messages[chatId] ?? [];
  },
  async sendMessage(chatId, req) {
    await sleep(config.mockLatencyMs + 700);
    const db = load();
    const chat = thread(db, chatId);
    const history = db.messages[chatId] ?? [];
    const content = mockAnswer(chat.lectureId, req, history);
    const ts = new Date().toISOString();
    const user: ChatMessage = { id: uid(), role: 'user', content: req.content, createdAt: ts, selection: req.selection ?? null };
    const assistant: ChatMessage = { id: uid(), role: 'assistant', content, createdAt: ts, selection: null };
    db.messages[chatId] = [...history, user, assistant];
    if (!history.length) chat.title = req.content.length > 60 ? `${req.content.slice(0, 57).trimEnd()}…` : req.content;
    Object.assign(chat, { updatedAt: ts, messageCount: db.messages[chatId].length, preview: req.content.slice(0, 140) });
    save(db);
    return { chat: { ...chat }, user, assistant };
  },
  async renameChat(chatId, title) {
    const db = load();
    const chat = thread(db, chatId);
    chat.title = title;
    save(db);
    return { ...chat };
  },
  async deleteChat(chatId) {
    const db = load();
    thread(db, chatId);
    db.chats = db.chats.filter((c) => c.id !== chatId);
    delete db.messages[chatId];
    save(db);
  },
};
