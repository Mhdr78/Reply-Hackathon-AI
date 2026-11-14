/** Service registry: the single place where mock vs. real implementations are chosen. */
import { config } from '@/config';
import { httpAuthProvider } from './auth/httpAuthProvider';
import { mockAuthProvider } from './auth/mockAuthProvider';
import { chatbotChapterService, httpChapterService, mockChapterService } from './chapters/ChapterService';
import { httpChatService, mockChatService } from './chat/ChatService';
import { httpCourseService, mockCourseService } from './courses/CourseService';
import { httpMaterialService, mockMaterialService } from './materials/MaterialService';
import { httpTranscriptionService } from './transcription/httpTranscriptionService';
import { mockTranscriptionService } from './transcription/mockTranscriptionService';

const baseServices = config.useMocks
  ? { auth: mockAuthProvider, courses: mockCourseService, transcription: mockTranscriptionService, chapters: mockChapterService, materials: mockMaterialService }
  : { auth: httpAuthProvider, courses: httpCourseService, transcription: httpTranscriptionService, chapters: httpChapterService, materials: httpMaterialService };


/**
 * The chatbot is its own server (services/chatbot), so it is chosen independently of VITE_USE_MOCKS.
 * It also generates the chapters (with the LLM) for the lectures it has prepared.
 */
const chat = config.chatbotUrl ? httpChatService : mockChatService;
const chapters = config.chatbotUrl ? chatbotChapterService : baseServices.chapters;

export const services = { ...baseServices, chat, chapters };

export type Services = typeof services;
