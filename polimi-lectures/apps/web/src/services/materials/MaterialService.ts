import { http } from '@/lib/http';
import { mediaExists } from '@/mocks/media';
import type { LectureMaterial, MaterialLink } from '@/types/domain';

/** PDFs related to a lecture (slides, notes…). Derived from the recording by the backend; mocked from public/media for now. */
export interface MaterialService {
  listMaterials(lectureId: string): Promise<LectureMaterial[]>;
}

/**
 * Manifest format for public/media/<lectureId>/materials.json (see docs/MATERIALS.md):
 * { "files": [ { "file": "slides.pdf", "title": "…", "kind": "slides", "description": "…",
 *                "links": [ { "start": 94.4, "end": 289.3, "page": 17 } ] } ] }
 * `links` also accepts the chatbot's reviewed_links.json shape ({ start_s, end_s, page_number }).
 */
interface ManifestFile {
  file: string;
  title?: string;
  kind?: LectureMaterial['kind'];
  description?: string;
  links?: (Partial<MaterialLink> & { start_s?: number; end_s?: number; page_number?: number })[];
}

export const materialsManifestUrl = (lectureId: string) => `/media/${lectureId}/materials.json`;

export function parseManifest(json: unknown, lectureId: string): LectureMaterial[] {
  const files = (json as { files?: ManifestFile[] })?.files;
  if (!Array.isArray(files)) throw new Error('materials.json needs a "files" array.');
  return files
    .filter((f) => typeof f?.file === 'string' && f.file.trim())
    .map((f, i) => ({
      id: `${lectureId}-m${i + 1}`,
      title: f.title?.trim() || f.file.replace(/\.pdf$/i, ''),
      fileName: f.file,
      url: /^(https?:)?\//.test(f.file) ? f.file : `/media/${lectureId}/${encodeURIComponent(f.file)}`,
      kind: f.kind,
      description: f.description,
      links: (f.links ?? [])
        .map((l) => ({ start: Number(l.start ?? l.start_s), end: Number(l.end ?? l.end_s), page: Number(l.page ?? l.page_number) }))
        .filter((l) => Number.isFinite(l.start) && l.end > l.start && Number.isInteger(l.page) && l.page > 0)
        .sort((a, b) => a.start - b.start),
    }));
}

export const mockMaterialService: MaterialService = {
  async listMaterials(lectureId) {
    const url = materialsManifestUrl(lectureId);
    if (!(await mediaExists(url, 'json'))) return [];
    const res = await fetch(url);
    try {
      return parseManifest(await res.json(), lectureId);
    } catch (e) {
      console.warn(`[materials] ${url}:`, e);
      return [];
    }
  },
};

export const httpMaterialService: MaterialService = {
  listMaterials: (lectureId) => http(`/lectures/${lectureId}/materials`),
};
