/** Shared domain types. These are the contracts between UI and services (and future backend). */

export interface Student {
  personCode: string; // Polimi "codice persona", used as username
  firstName: string;
  lastName: string;
  email: string;
  programme: string;
  academicTerm: AcademicTerm;
}

export interface AcademicTerm {
  id: string; // e.g. "2026-27-S1"
  label: string; // e.g. "A.Y. 2026/27 · Semester 1"
}

export interface Session {
  accessToken: string;
  expiresAt: string; // ISO
  student: Student;
}

export interface Instructor {
  name: string;
  email?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description: string;
  instructors: Instructor[];
  credits: number; // CFU
  language: 'en' | 'it';
  campus: string;
  schedule: string;
  recordingCount: number;
  lastRecordingAt?: string; // ISO
  color: string; // accent used in the UI
}

export interface Lecture {
  id: string;
  courseId: string;
  number: number;
  title: string;
  recordedAt: string; // ISO
  durationSec: number;
  room: string;
  videoUrl: string;
}

/* ---------- Transcription (WhisperX-compatible) ---------- */

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
  score?: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string; // e.g. "SPEAKER_00"
  words: TranscriptWord[]; // may be empty
}

export interface Transcript {
  lectureId: string;
  language: string;
  segments: TranscriptSegment[];
  speakers?: Record<string, string>; // optional display names for speaker ids
  engine?: string;
  createdAt?: string;
}

export type TranscriptionStatus = 'not_started' | 'queued' | 'processing' | 'completed' | 'failed';

export interface TranscriptionJob {
  lectureId: string;
  status: TranscriptionStatus;
  progress?: number; // 0..1, when processing
  error?: string;
  updatedAt: string;
}

/* ---------- Chapters (YouTube-style lecture segments) ---------- */

/** A titled section of a lecture. Chapters are contiguous: each ends where the next one starts. */
export interface Chapter {
  id: string;
  start: number; // seconds
  end: number; // seconds
  title: string;
  summary?: string; // one or two sentences, shown in the chapter list
}

/** Who produced the titles: placeholder heuristics, an LLM over the transcript, a person, or the chatbot's --fake-llm mode. */
export type ChapterSource = 'mock' | 'llm' | 'manual' | 'fake';

export interface LectureChapters {
  lectureId: string;
  source: ChapterSource;
  model?: string; // e.g. the LLM used, for display/debugging
  createdAt?: string;
  chapters: Chapter[];
}

/* ---------- Segment selection ---------- */

/** A time range of the lecture the student selected (transcript highlight or seek-bar drag). */
export interface TimeSelection {
  start: number; // seconds
  end: number;
  source: 'transcript' | 'timeline';
  text?: string; // selected transcript text, when selected from the transcript
}

/* ---------- Chat (persistent, several chats per lecture) ---------- */

export interface ChatThread {
  id: string;
  lectureId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview?: string | null; // last question
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Markdown. Citations are inline: [m:ss], [m:ss-m:ss] and [PDF p. N]. */
  content: string;
  createdAt: string;
  selection?: { start: number; end: number } | null; // the segment a question was about
  error?: boolean; // client-side only: failed request
}

/** Whether the assistant has sources (transcript + PDFs) prepared for a lecture. */
export interface ChatLectureStatus {
  lectureId: string;
  prepared: boolean;
  pdf?: string;
  /** Why the assistant can't use this lecture yet (e.g. no transcript or slides). */
  reason?: string;
}

export interface SendMessageRequest {
  content: string;
  selection?: { start: number; end: number };
}

export interface SendMessageResponse {
  chat: ChatThread;
  user: ChatMessage;
  assistant: ChatMessage;
}

/* ---------- Lecture materials (PDFs derived from the recording) ---------- */

export interface MaterialLink {
  start: number; // seconds
  end: number;
  page: number; // 1-based PDF page relevant to this time range
}

export interface LectureMaterial {
  id: string;
  title: string;
  url: string; // PDF URL
  fileName: string;
  kind?: 'slides' | 'notes' | 'exercises' | 'other';
  description?: string;
  links?: MaterialLink[];
}
