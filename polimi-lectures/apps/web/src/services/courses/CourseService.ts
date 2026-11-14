import { config } from '@/config';
import { AppError } from '@/lib/errors';
import { http } from '@/lib/http';
import { sleep } from '@/lib/format';
import { mockCourses, mockLectures } from '@/mocks/courses';
import { localVideoUrl, mediaExists } from '@/mocks/media';
import type { Course, Lecture } from '@/types/domain';

export interface CourseService {
  listCourses(termId: string): Promise<Course[]>;
  getCourse(courseId: string): Promise<Course>;
  listLectures(courseId: string): Promise<Lecture[]>;
  getLecture(lectureId: string): Promise<Lecture>;
}

const found = <T,>(v: T | undefined): T => {
  if (!v) throw new AppError('NOT_FOUND');
  return v;
};

export const mockCourseService: CourseService = {
  async listCourses() {
    await sleep(config.mockLatencyMs);
    return mockCourses;
  },
  async getCourse(id) {
    await sleep(config.mockLatencyMs);
    return found(mockCourses.find((c) => c.id === id));
  },
  async listLectures(courseId) {
    await sleep(config.mockLatencyMs);
    return mockLectures.filter((l) => l.courseId === courseId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  },
  async getLecture(id) {
    await sleep(config.mockLatencyMs / 2);
    const lecture = found(mockLectures.find((l) => l.id === id));
    // Prefer public/media/<id>.mp4 when present, otherwise the shared demo video.
    return (await mediaExists(localVideoUrl(id), 'video')) ? { ...lecture, videoUrl: localVideoUrl(id) } : lecture;
  },
};

export const httpCourseService: CourseService = {
  listCourses: (termId) => http(`/terms/${termId}/courses`),
  getCourse: (id) => http(`/courses/${id}`),
  listLectures: (courseId) => http(`/courses/${courseId}/lectures`),
  getLecture: (id) => http(`/lectures/${id}`),
};
