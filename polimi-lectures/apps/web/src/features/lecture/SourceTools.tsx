import { useEffect, useRef, useState } from 'react';
import { config } from '@/config';
import { chatbotCall } from '@/services/chatbotApi';
import type { Transcript } from '@/types/domain';

type TranslationJob = { status: string; error?: string; transcript?: Transcript };
export function SourceTools({ lectureId, original, onTranslated }: { lectureId: string; original?: Transcript; onTranslated: (t?: Transcript) => void }) {
  const [language, setLanguage] = useState('original');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setLanguage('original'); onTranslated(undefined); }, [lectureId, original]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { generation.current++; }, []);

  async function translate(target: string) {
    const token = ++generation.current;
    setLanguage(target); setMessage(''); onTranslated(undefined);
    if (target === 'original' || target === original?.language) { setBusy(false); return; }
    setBusy(true);
    try {
      const path = `/lectures/${encodeURIComponent(lectureId)}/translations/${target}`;
      let result = await chatbotCall<TranslationJob>(path);
      if (token !== generation.current) return;
      if (result.status !== 'completed') result = await chatbotCall<TranslationJob>(path, { method: 'POST' });
      while (token === generation.current && ['queued', 'processing'].includes(result.status)) {
        setMessage('Translating the full lecture… You can keep watching.');
        await new Promise((r) => setTimeout(r, 2000));
        if (token !== generation.current) return;
        result = await chatbotCall<TranslationJob>(path);
      }
      if (token !== generation.current) return;
      if (result.status !== 'completed' || !result.transcript) throw new Error(result.error || 'Translation failed.');
      onTranslated(result.transcript); setMessage('Translation ready · original video timestamps preserved.');
    } catch (e) { if (token === generation.current) setMessage(e instanceof Error ? e.message : 'Translation failed.'); }
    finally { if (token === generation.current) setBusy(false); }
  }

  async function sendFiles(files: FileList) {
    setBusy(true); setMessage('Uploading sources to the local server…');
    const body = new FormData(); Array.from(files).forEach((f) => body.append('files', f));
    try {
      const response = await fetch(`${config.chatbotUrl}/api/lectures/${encodeURIComponent(lectureId)}/sources`, { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Upload failed.');
      window.location.reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed.'); setBusy(false); }
  }
  return <div className="border-b border-slate-100 bg-white px-4 py-2 text-sm sm:px-6">
    <div className="flex flex-wrap items-center gap-3">
      <input ref={upload} type="file" multiple accept=".mp4,.json,.pdf" className="hidden" onChange={(e) => { if (e.target.files?.length) void sendFiles(e.target.files); e.target.value = ''; }} />
      <button disabled={busy} onClick={() => upload.current?.click()} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Upload sources for AI</button>
      <label className="flex items-center gap-2">Transcript language
        <select aria-label="Transcript language" value={language} disabled={!original} onChange={(e) => void translate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
          <option value="original">Original</option><option value="en">English</option><option value="it">Italiano</option>
        </select>
      </label>
      <span className="text-xs text-slate-500">MP4, original transcript JSON, PDFs · translation may use up to $0.10 per request</span>
    </div>
    {message && <p role="status" className="mt-1 text-xs text-slate-600">{message}</p>}
  </div>;
}
