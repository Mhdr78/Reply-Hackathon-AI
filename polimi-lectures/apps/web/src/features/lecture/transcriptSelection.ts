import type { TimeSelection, TranscriptSegment } from '@/types/domain';

/**
 * Converts a DOM text selection inside the transcript into a time range.
 * Uses word-level timestamps when available (exact to the word), otherwise interpolates inside the segment.
 *
 * DOM contract (TranscriptViewer): each segment is `<li data-seg={id}>` and its text is `<span data-seg-text>`.
 */
export function rangeToSelection(range: Range, container: HTMLElement, segments: TranscriptSegment[]): TimeSelection | null {
  if (range.collapsed || !container.contains(range.commonAncestorContainer)) return null;
  const byId = new Map(segments.map((s) => [s.id, s]));

  const hits = [...container.querySelectorAll<HTMLElement>('[data-seg]')]
    .filter((li) => range.intersectsNode(li))
    .map((li) => ({ li, seg: byId.get(Number(li.dataset.seg))!, text: selectedText(range, li) }))
    .filter((h) => h.seg && h.text.trim());
  if (!hits.length) return null;

  const first = hits[0];
  const last = hits.at(-1)!;
  const start = edgeTime(range.startContainer, range.startOffset, first.li, first.seg, 'start');
  const end = edgeTime(range.endContainer, range.endOffset, last.li, last.seg, 'end');
  if (!(end > start)) return null;

  const text = hits.map((h) => h.text.trim()).join(' ').replace(/\s+/g, ' ');
  return { start: round(start), end: round(Math.max(end, start + 0.5)), source: 'transcript', text: text.length > 400 ? `${text.slice(0, 399)}…` : text };
}

const round = (t: number) => Math.round(t * 10) / 10;

function selectedText(range: Range, li: HTMLElement): string {
  const span = li.querySelector('[data-seg-text]');
  if (!span) return '';
  const r = document.createRange();
  r.selectNodeContents(span);
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
  return r.collapsed ? '' : r.toString();
}

/** Time of a selection boundary. If the boundary is outside the segment's text (e.g. on a timestamp), use the segment edge. */
function edgeTime(node: Node, offset: number, li: HTMLElement, seg: TranscriptSegment, edge: 'start' | 'end'): number {
  const span = li.querySelector('[data-seg-text]');
  if (!span || !span.contains(node)) return edge === 'start' ? seg.start : seg.end;
  const r = document.createRange();
  r.setStart(span, 0);
  r.setEnd(node, offset);
  const charOffset = r.toString().length;
  const rendered = span.textContent ?? '';
  return timeAtChar(seg, charOffset, rendered.length, edge);
}

function timeAtChar(seg: TranscriptSegment, offset: number, length: number, edge: 'start' | 'end'): number {
  const words = seg.words;
  if (!words.length || !length) return seg.start + (length ? offset / length : 0) * (seg.end - seg.start);
  // Map the character offset onto the words (rendered text ≈ words joined by spaces).
  const joined = words.map((w) => w.word).join(' ');
  const pos = (offset / length) * joined.length;
  let at = 0;
  for (let i = 0; i < words.length; i++) {
    const wEnd = at + words[i].word.length;
    if (edge === 'start' && pos < wEnd) return words[i].start;
    if (edge === 'end' && pos <= wEnd + 0.5) return pos <= at ? (words[i - 1]?.end ?? words[i].start) : words[i].end;
    at = wEnd + 1;
  }
  return edge === 'start' ? words.at(-1)!.start : words.at(-1)!.end;
}
