import { config } from '@/config';
import type { Course, Lecture, Student, TranscriptionStatus } from '@/types/domain';

export const mockTerm = { id: '2026-27-S1', label: 'A.Y. 2026/27 · Semester 1' };

export function mockStudent(personCode: string): Student {
  return {
    personCode,
    firstName: 'Giulia',
    lastName: 'Bianchi',
    email: 'giulia.bianchi@mail.polimi.it',
    programme: 'MSc Computer Science and Engineering',
    academicTerm: mockTerm,
  };
}

type CourseSeed = Omit<Course, 'recordingCount' | 'lastRecordingAt'> & { lectureTitles: string[]; firstDate: string; weekday: number[] };

const seeds: CourseSeed[] = [
  {
    id: 'ml', code: '052512', name: 'Machine Learning', credits: 8, language: 'en', campus: 'Leonardo', schedule: 'Mon 10:15–13:15 · Thu 14:15–16:15',
    color: '#2563eb', instructors: [{ name: 'Prof. Marco Colombo' }, { name: 'Dr. Elena Russo' }],
    description: 'Foundations of statistical learning: supervised and unsupervised methods, model selection, kernels, and an introduction to reinforcement learning, with a strong emphasis on the bias–variance trade-off and generalization.',
    firstDate: '2026-09-14', weekday: [1, 4],
    lectureTitles: ['Introduction to Machine Learning', 'Linear Regression and Least Squares', 'Regularization: Ridge and Lasso', 'Bias–Variance Trade-off', 'Linear Classification and Logistic Regression', 'Model Selection and Cross-Validation', 'Kernel Methods', 'Support Vector Machines', 'PAC Learning and VC Dimension', 'Introduction to Reinforcement Learning'],
  },
  {
    id: 'ann', code: '054307', name: 'Artificial Neural Networks and Deep Learning', credits: 5, language: 'en', campus: 'Leonardo', schedule: 'Tue 14:15–17:15',
    color: '#7c3aed', instructors: [{ name: 'Prof. Luca Moretti' }],
    description: 'From the perceptron to modern deep architectures: backpropagation, convolutional networks, recurrent models, attention and transformers, with practical sessions in PyTorch.',
    firstDate: '2026-09-15', weekday: [2],
    lectureTitles: ['From the Perceptron to Feed-Forward Networks', 'Backpropagation and Gradient Descent', 'Convolutional Neural Networks', 'Training Tricks: Dropout and Batch Norm', 'Recurrent Networks and LSTMs', 'Attention and Transformers'],
  },
  {
    id: 'se2', code: '052522', name: 'Software Engineering 2', credits: 10, language: 'en', campus: 'Leonardo', schedule: 'Wed 08:15–11:15 · Fri 11:15–13:15',
    color: '#059669', instructors: [{ name: 'Prof. Chiara Galli' }, { name: 'Prof. Andrea Ferri' }],
    description: 'Requirements engineering, software architecture, formal modelling with Alloy, verification and testing, and project management for large software systems.',
    firstDate: '2026-09-16', weekday: [3, 5],
    lectureTitles: ['Requirements Engineering: World and Machine', 'Goals, Domain Assumptions and Requirements', 'Modelling with Alloy', 'Software Architecture Styles', 'Design Documents', 'Verification and Testing', 'Project Effort Estimation'],
  },
  {
    id: 'sec', code: '054311', name: 'Computer Security', credits: 5, language: 'en', campus: 'Leonardo', schedule: 'Thu 10:15–13:15',
    color: '#dc2626', instructors: [{ name: 'Prof. Davide Conti' }],
    description: 'Principles of information security: cryptography, authentication, access control, software vulnerabilities, web security and network protection.',
    firstDate: '2026-09-17', weekday: [4],
    lectureTitles: ['Security Principles and Threat Models', 'Symmetric and Asymmetric Cryptography', 'Authentication and MFA', 'Memory Errors and Buffer Overflows', 'Web Application Security'],
  },
  {
    id: 'aapp', code: '054310', name: 'Advanced Algorithms and Parallel Programming', credits: 8, language: 'en', campus: 'Leonardo', schedule: 'Mon 14:15–17:15',
    color: '#d97706', instructors: [{ name: 'Prof. Paolo Ricci' }],
    description: 'Randomized and approximation algorithms, amortized analysis, and parallel programming models: OpenMP, MPI and CUDA.',
    firstDate: '2026-09-14', weekday: [1],
    lectureTitles: ['Randomized Algorithms', 'Amortized Analysis', 'Parallel Programming with OpenMP', 'Message Passing with MPI'],
  },
  {
    id: 'rs', code: '055154', name: 'Recommender Systems', credits: 5, language: 'en', campus: 'Bovisa', schedule: 'Fri 14:15–17:15',
    color: '#0891b2', instructors: [{ name: 'Prof. Sara Lombardi' }],
    description: 'Collaborative filtering, content-based and hybrid recommenders, evaluation methodologies and industrial case studies. Recordings start after the mid-term break.',
    firstDate: '2026-09-18', weekday: [5], lectureTitles: [],
  },
];

const ROOMS = ['B.2.2', 'T.0.1', 'N.1.2', 'L.26.01', '3.0.1'];

function buildLectures(seed: CourseSeed): Lecture[] {
  const date = new Date(`${seed.firstDate}T10:15:00Z`);
  return seed.lectureTitles.map((title, i) => {
    if (i > 0) {
      // advance to next scheduled weekday
      do date.setUTCDate(date.getUTCDate() + 1);
      while (!seed.weekday.includes(date.getUTCDay()));
    }
    return {
      id: `${seed.id}-${String(i + 1).padStart(2, '0')}`,
      courseId: seed.id,
      number: i + 1,
      title,
      recordedAt: date.toISOString(),
      durationSec: 5100 + ((i * 7919 + seed.id.length * 131) % 1800),
      room: ROOMS[(i + seed.id.length) % ROOMS.length],
      videoUrl: config.lectureVideoUrl,
    };
  });
}

export const mockLectures: Lecture[] = seeds.flatMap(buildLectures);

export const mockCourses: Course[] = seeds.map(({ lectureTitles: _t, firstDate: _f, weekday: _w, ...c }) => {
  const lectures = mockLectures.filter((l) => l.courseId === c.id);
  return { ...c, recordingCount: lectures.length, lastRecordingAt: lectures.at(-1)?.recordedAt };
});

/** Initial transcription state, to demo every status. Latest lecture of each course is not transcribed yet. */
export function initialTranscriptionStatus(lecture: Lecture): TranscriptionStatus {
  const total = mockLectures.filter((l) => l.courseId === lecture.courseId).length;
  if (lecture.id === 'sec-04') return 'failed';
  if (lecture.id === 'ann-06') return 'processing';
  if (lecture.number === total) return 'not_started';
  return 'completed';
}
