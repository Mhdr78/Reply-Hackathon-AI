import { Fragment, type ReactNode } from 'react';
import { FileText, Play } from 'lucide-react';
import { formatTimestamp } from '@/lib/format';

/**
 * Minimal, safe Markdown renderer for assistant answers (no HTML is ever injected).
 * Supports paragraphs, headings, lists, blockquotes, code, bold/italic, links and inline math,
 * and turns citations into buttons:
 *   [m:ss], [h:mm:ss], [m:ss-m:ss], [331.6 s], [331.6-366.6 s]  → seek the video
 *   [PDF p. 17], [PDF pp. 17-18]                                  → open the PDF at that page
 */
export interface CitationHandlers {
  onSeek?: (seconds: number) => void;
  onOpenPdf?: (page: number, documentId?: string) => void;
}

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const SEC = String.raw`\d+(?:\.\d+)?`;
const INLINE = new RegExp(
  [
    String.raw`(\x60[^\x60]+\x60)`, // 1 code
    String.raw`\[(${TS})(?:\s*[-–—]\s*(${TS}))?\]`, // 2,3 timestamps
    String.raw`\[(${SEC})\s*s?(?:\s*[-–—]\s*(${SEC}))?\s*s\]`, // 4,5 seconds
    String.raw`\[PDF\s+pp?\.\s*(\d+)(?:\s*[-–—,]\s*(?:p\.\s*)?(\d+))?\]`, // 6,7 pdf pages
    String.raw`\*\*([^*]+)\*\*`, // 8 bold
    String.raw`(?<![\w*])\*([^*\n]+)\*(?!\*)|(?<!\w)_([^_\n]+)_(?!\w)`, // 9,10 italic
    String.raw`\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)`, // 11,12 link
    String.raw`\$([^$\n]+)\$`, // 13 inline math
    String.raw`\[PDF\s+(document_\d+)\s+p\.\s*(\d+)\]`, // 14,15 identified PDF
  ].join('|'),
  'g',
);

const toSeconds = (ts: string) => ts.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);

function inline(text: string, h: CitationHandlers, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    last = at + m[0].length;
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={key} className="rounded bg-slate-100 px-1 py-px font-mono text-[12px] text-slate-800">{m[1].slice(1, -1)}</code>);
    else if (m[2] || m[4]) {
      const start = m[2] ? toSeconds(m[2]) : Number(m[4]);
      const end = m[3] ? toSeconds(m[3]) : m[5] ? Number(m[5]) : undefined;
      out.push(<TimeChip key={key} start={start} end={end} onSeek={h.onSeek} />);
    } else if (m[6]) {
      out.push(<PdfChip key={key} page={Number(m[6])} to={m[7] ? Number(m[7]) : undefined} onOpen={h.onOpenPdf} />);
    } else if (m[8]) out.push(<strong key={key} className="font-semibold text-ink">{inline(m[8], h, key)}</strong>);
    else if (m[9] || m[10]) out.push(<em key={key}>{inline(m[9] ?? m[10], h, key)}</em>);
    else if (m[11]) out.push(<a key={key} href={m[12]} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-600 underline underline-offset-2">{m[11]}</a>);
    else if (m[14]) out.push(<PdfChip key={key} page={Number(m[15])} onOpen={(page) => h.onOpenPdf?.(page, m[14])} />);
    else if (m[13]) out.push(<span key={key} className="rounded bg-slate-50 px-1 font-mono text-[12.5px] italic">{m[13]}</span>);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function TimeChip({ start, end, onSeek }: { start: number; end?: number; onSeek?: (t: number) => void }) {
  const label = end !== undefined ? `${formatTimestamp(start)}–${formatTimestamp(end)}` : formatTimestamp(start);
  return (
    <button
      type="button"
      onClick={() => onSeek?.(start)}
      title="Jump to this moment"
      className="mx-0.5 inline-flex h-[21px] translate-y-[-1px] items-center gap-1 rounded-md bg-brand-50 px-1.5 align-middle font-mono text-[11px] font-medium text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100"
    >
      <Play className="size-2.5 fill-current" />{label}
    </button>
  );
}

function PdfChip({ page, to, onOpen }: { page: number; to?: number; onOpen?: (p: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(page)}
      title="Open the slides at this page"
      className="mx-0.5 inline-flex h-[21px] translate-y-[-1px] items-center gap-1 rounded-md bg-amber-50 px-1.5 align-middle text-[11px] font-medium text-amber-800 ring-1 ring-amber-100 transition hover:bg-amber-100"
    >
      <FileText className="size-3" />p. {page}{to ? `–${to}` : ''}
    </button>
  );
}

type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; level: number; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'code'; text: string };

function blocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join('\n') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push({ t: 'code', text: code.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (h) { flush(); out.push({ t: 'h', level: h[1].length, text: h[2] }); }
    else if (ul || ol) {
      flush();
      const type = ul ? 'ul' : 'ol';
      const prev = out.at(-1);
      const item = (ul ?? ol)![1];
      if (prev && prev.t === type) prev.items.push(item);
      else out.push({ t: type, items: [item] });
    } else if (q) {
      flush();
      const prev = out.at(-1);
      if (prev?.t === 'quote') prev.text += `\n${q[1]}`;
      else out.push({ t: 'quote', text: q[1] });
    } else {
      // continuation of a list item
      const prev = out.at(-1);
      if (!para.length && prev && (prev.t === 'ul' || prev.t === 'ol') && /^\s{2,}/.test(line)) prev.items[prev.items.length - 1] += ` ${line.trim()}`;
      else para.push(line);
    }
  }
  flush();
  return out;
}

export function Markdown({ content, ...h }: { content: string } & CitationHandlers) {
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-slate-800">
      {blocks(content).map((b, i) => {
        const k = String(i);
        switch (b.t) {
          case 'h':
            return <p key={k} className="pt-1 text-[13.5px] font-semibold text-ink">{inline(b.text, h, k)}</p>;
          case 'ul':
          case 'ol': {
            const List = b.t === 'ul' ? 'ul' : 'ol';
            return (
              <List key={k} className={b.t === 'ul' ? 'list-disc space-y-1 pl-5 marker:text-slate-400' : 'list-decimal space-y-1 pl-5 marker:text-slate-400'}>
                {b.items.map((it, j) => <li key={j}>{inline(it, h, `${k}-${j}`)}</li>)}
              </List>
            );
          }
          case 'quote':
            return <blockquote key={k} className="border-l-2 border-slate-200 pl-3 text-slate-600">{b.text.split('\n').map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, h, `${k}-${j}`)}</Fragment>)}</blockquote>;
          case 'code':
            return <pre key={k} className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[12px] leading-relaxed text-slate-100">{b.text}</pre>;
          default:
            return <p key={k}>{b.text.split('\n').map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, h, `${k}-${j}`)}</Fragment>)}</p>;
        }
      })}
    </div>
  );
}
