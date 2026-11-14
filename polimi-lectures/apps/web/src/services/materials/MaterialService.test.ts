import { describe, expect, it } from 'vitest';
import { parseManifest } from './MaterialService';

describe('parseManifest', () => {
  it('builds URLs, defaults titles and accepts both link shapes', () => {
    const [slides, notes] = parseManifest(
      {
        files: [
          { file: 'My Slides.pdf', kind: 'slides', links: [{ start: 10, end: 20, page: 3 }, { start_s: 0, end_s: 5, page_number: 1 }] },
          { file: 'https://example.org/notes.pdf', title: 'Notes' },
        ],
      },
      'ml-01',
    );
    expect(slides.url).toBe('/media/ml-01/My%20Slides.pdf');
    expect(slides.title).toBe('My Slides');
    expect(slides.links).toEqual([{ start: 0, end: 5, page: 1 }, { start: 10, end: 20, page: 3 }]);
    expect(notes.url).toBe('https://example.org/notes.pdf');
  });

  it('ignores invalid links and entries, and rejects a manifest without files', () => {
    const [m] = parseManifest({ files: [{ file: 'a.pdf', links: [{ start: 5, end: 2, page: 1 }, { start: 0, end: 1, page: 0 }] }, { title: 'no file' }] }, 'x');
    expect(m.links).toEqual([]);
    expect(() => parseManifest({}, 'x')).toThrow(/files/);
  });
});
