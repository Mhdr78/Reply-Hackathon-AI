import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowUp, Check, History, MessageSquarePlus, Pencil, RotateCw, Scissors, Sparkles, Trash2, X } from 'lucide-react';
import { services } from '@/services';
import { toAppError, type AppError } from '@/lib/errors';
import { cn, formatTimestamp, uid } from '@/lib/format';
import { Markdown } from '@/components/Markdown';
import { Skeleton } from '@/components/ui';
import type { ChatLectureStatus, ChatMessage, ChatThread, Lecture, TimeSelection } from '@/types/domain';

interface Props {
  lecture: Lecture;
  onClose: () => void;
  /** Seek within the current lecture. */
  onSeek: (t: number) => void;
  /** Open the lecture's slides at a page (from [PDF p. N] citations). */
  onOpenPdf: (page: number, documentId?: string) => void;
  /** The segment currently selected on the timeline or in the transcript; attached to the next question. */
  selection: TimeSelection | null;
  onClearSelection: () => void;
  /** Incremented when the student clicks "Ask about this" — focuses the composer. */
  askSignal: number;
}

type View = { kind: 'list' } | { kind: 'chat'; chatId: string | null }; // chatId null = new, unsaved chat
interface Failed { content: string; selection?: { start: number; end: number }; error: AppError }

const rangeLabel = (s: { start: number; end: number }) => `${formatTimestamp(s.start)}–${formatTimestamp(s.end)}`;

export function ChatPanel({ lecture, onClose, onSeek, onOpenPdf, selection, onClearSelection, askSignal }: Props) {
  const svc = services.chat;
  const [responseLanguage, setResponseLanguage] = useState<'en' | 'it'>('en');
  const [status, setStatus] = useState<ChatLectureStatus>();
  const [chats, setChats] = useState<ChatThread[]>();
  const [loadError, setLoadError] = useState<AppError>();
  const [view, setView] = useState<View>({ kind: 'chat', chatId: null });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<ChatMessage | null>(null); // optimistic user message
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load status + chat list for this lecture.
  useEffect(() => {
    let alive = true;
    setLoadError(undefined);
    setChats(undefined);
    Promise.all([svc.getStatus(lecture.id), svc.listChats(lecture.id)])
      .then(([st, list]) => {
        if (!alive) return;
        setStatus(st);
        setChats(list);
        setView(list.length ? { kind: 'list' } : { kind: 'chat', chatId: null });
      })
      .catch((e) => alive && setLoadError(toAppError(e)));
    return () => { alive = false; };
  }, [lecture.id, svc, attempt]);

  // Load messages when opening an existing chat.
  const chatId = view.kind === 'chat' ? view.chatId : null;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    setFailed(null);
    if (!chatId) { setMessages([]); setLoadedFor(null); return; }
    if (loadedFor === chatId) return; // just created by send()
    let alive = true;
    setMessagesLoading(true);
    svc.getMessages(chatId)
      .then((m) => { if (alive) { setMessages(m); setLoadedFor(chatId); } })
      .catch((e) => alive && setFailed({ content: '', error: toAppError(e) }))
      .finally(() => alive && setMessagesLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, svc]);

  // "Ask about this" from the transcript / timeline: make sure a conversation is open, then focus.
  useEffect(() => {
    if (!askSignal) return;
    setView((v) => (v.kind === 'list' ? { kind: 'chat', chatId: null } : v));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [askSignal]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, failed]);

  const upsertChat = useCallback((c: ChatThread) => setChats((list) => [c, ...(list ?? []).filter((x) => x.id !== c.id)]), []);

  async function send(text: string, sel = selection ? { start: selection.start, end: selection.end } : undefined) {
    const content = text.trim();
    if (!content || pending) return;
    const optimistic: ChatMessage = { id: `tmp-${uid()}`, role: 'user', content, createdAt: new Date().toISOString(), selection: sel ?? null };
    setPending(optimistic);
    setFailed(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    let created: string | null = null;
    try {
      let id: string;
      if (chatId) id = chatId;
      else {
        // New chat: created on the server only when the first question is sent.
        const chat = await svc.createChat(lecture.id);
        created = id = chat.id;
      }
      const r = await svc.sendMessage(id, { content, selection: sel, response_language: responseLanguage });
      if (created) { setLoadedFor(id); setView({ kind: 'chat', chatId: id }); }
      setMessages((m) => [...m, r.user, r.assistant]);
      upsertChat(r.chat);
      if (sel) onClearSelection();
    } catch (e) {
      // Don't leave an empty chat behind if its very first question failed.
      if (created) void svc.deleteChat(created).catch(() => {});
      setFailed({ content, selection: sel, error: toAppError(e) });
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    try {
      await svc.deleteChat(id);
      setChats((list) => list?.filter((c) => c.id !== id));
      if (chatId === id) setView({ kind: 'list' });
    } catch (e) {
      setLoadError(toAppError(e));
    }
  }

  async function rename(id: string, title: string) {
    try { upsertChat(await svc.renameChat(id, title)); } catch { /* keep old title */ }
  }

  const current = chats?.find((c) => c.id === chatId);
  const notPrepared = status && !status.prepared;
  const canAsk = !loadError && !notPrepared;
  const suggestions = selection
    ? ['Explain this part in simple terms', 'Summarize this part', 'Which slide is this about?']
    : ['Summarize this lecture', 'What are the key concepts?', 'Which slides should I review for the exam?'];

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-slate-100 px-3">
        {view.kind === 'chat' && chats && chats.length > 0 ? (
          <HeaderBtn label="All chats" onClick={() => setView({ kind: 'list' })}><ArrowLeft className="size-4" /></HeaderBtn>
        ) : (
          <div className="ml-1 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white"><Sparkles className="size-3.5" /></div>
        )}
        <div className="ml-1 mr-auto min-w-0 leading-tight">
          {view.kind === 'chat' && current ? (
            <EditableTitle key={current.id} title={current.title} onSave={(t) => rename(current.id, t)} />
          ) : (
            <div className="text-[13.5px] font-semibold">{view.kind === 'list' ? 'Your chats' : 'New chat'}</div>
          )}
          <div className="truncate text-[11px] text-slate-500">
            {svc.kind === 'mock' ? 'Lecture assistant · mock responses' : 'Lecture assistant · RAG · transcript + PDFs'}
          </div>
        </div>
        {view.kind === 'chat' && current && <DeleteButton onConfirm={() => remove(current.id)} />}
        {view.kind === 'chat' && !!chats?.length && <HeaderBtn label="All chats" onClick={() => setView({ kind: 'list' })}><History className="size-4" /></HeaderBtn>}
        <HeaderBtn label="New chat" onClick={() => { setView({ kind: 'chat', chatId: null }); requestAnimationFrame(() => inputRef.current?.focus()); }}><MessageSquarePlus className="size-4" /></HeaderBtn>
        <HeaderBtn label="Close assistant" onClick={onClose}><X className="size-4" /></HeaderBtn>
      </header>

      {loadError && (
        <div className="m-3 rounded-lg bg-red-50 p-3 text-[12.5px] leading-relaxed text-red-700">
          <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1"><Markdown content={loadError.message} /></span></div>
          <button onClick={() => setAttempt((n) => n + 1)} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-medium text-red-700 shadow-sm ring-1 ring-red-100 hover:bg-red-50"><RotateCw className="size-3.5" />Retry</button>
        </div>
      )}
      {notPrepared && (
        <div className="m-3 rounded-lg bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-800">
          <p className="font-medium">The assistant can't use this lecture yet.</p>
          <p className="mt-0.5">{status?.reason ?? 'Its transcript and slides are not available to the assistant.'}</p>
        </div>
      )}

      {/* Body */}
      {view.kind === 'list' ? (
        <ChatList chats={chats} onOpen={(id) => setView({ kind: 'chat', chatId: id })} onDelete={remove} onNew={() => setView({ kind: 'chat', chatId: null })} />
      ) : (
        <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messagesLoading && <div className="space-y-3"><Skeleton className="ml-10 h-9" /><Skeleton className="h-16" /><Skeleton className="ml-10 h-9" /></div>}
          {!messagesLoading && !messages.length && !pending && !failed && canAsk && chats && (
            <div className="animate-fade-in pt-4 text-center">
              <p className="text-sm font-medium">{selection ? 'Ask about the selected part' : 'Ask anything about this lecture'}</p>
              <p className="mx-auto mt-1 max-w-[270px] text-xs leading-relaxed text-slate-500">
                {selection
                  ? 'Your question will be answered with this part of the lecture in focus.'
                  : 'Select text in the transcript, or Shift+drag on the video timeline, to ask about a specific part.'}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:border-brand-200 hover:bg-brand-50/50">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => <Bubble key={m.id} msg={m} onSeek={onSeek} onOpenPdf={onOpenPdf} />)}
          {pending && <Bubble msg={pending} onSeek={onSeek} onOpenPdf={onOpenPdf} />}
          {pending && (
            <div className="flex items-center gap-2 px-1 py-1 text-[12px] text-slate-500" aria-label="Assistant is thinking">
              {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}
              {svc.kind === 'server' && <span className="ml-1">Finding relevant lecture passages and slides…</span>}
            </div>
          )}
          {failed && (
            <div className="animate-fade-in space-y-2">
              {failed.content && <Bubble msg={{ id: 'failed', role: 'user', content: failed.content, createdAt: '', selection: failed.selection }} onSeek={onSeek} onOpenPdf={onOpenPdf} />}
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Markdown content={failed.error.message} />
                  {failed.content && (
                    <button onClick={() => { const f = failed; setFailed(null); void send(f.content, f.selection); }} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-medium shadow-sm ring-1 ring-red-100 hover:bg-red-50">
                      <RotateCw className="size-3.5" />Try again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Composer */}
      {view.kind === 'chat' && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); void send(input); }} className="shrink-0 border-t border-slate-100 p-3">
          <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">Answer language <select aria-label="Answer language" disabled={!!pending} value={responseLanguage} onChange={(e) => setResponseLanguage(e.target.value as 'en' | 'it')} className="rounded border border-slate-200 px-2 py-1"><option value="en">English</option><option value="it">Italiano</option></select></label>
          <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100', !canAsk && 'opacity-60')}>
            {selection && (
              <div className="flex items-start gap-2 border-b border-slate-100 px-2.5 py-2">
                <span className="mt-px grid size-6 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-700"><Scissors className="size-3.5" /></span>
                <button type="button" onClick={() => onSeek(selection.start)} className="min-w-0 flex-1 text-left" title="Play the selected part">
                  <span className="block font-mono text-[11.5px] font-semibold text-slate-700">{rangeLabel(selection)} <span className="font-sans font-normal text-slate-400">· {Math.round(selection.end - selection.start)} s selected</span></span>
                  {selection.text && <span className="block truncate text-[12px] text-slate-500">“{selection.text}”</span>}
                </button>
                <button type="button" onClick={onClearSelection} aria-label="Remove selection" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-3.5" /></button>
              </div>
            )}
            <div className="flex items-end gap-2 p-1.5 pl-3">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                disabled={!canAsk}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                placeholder={selection ? 'Ask about the selected part…' : messages.length ? 'Ask a follow-up…' : 'Ask about this lecture…'}
                aria-label="Message"
                className="max-h-[140px] min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={!input.trim() || !!pending || !canAsk} aria-label="Send" className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400">
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-slate-400">
            {svc.kind === 'mock' ? 'Mock assistant: keyword search over the transcript.' : 'AI answers can be wrong. Check the cited moments and slides.'}
          </p>
        </form>
      )}
    </div>
  );
}

function HeaderBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{children}</button>;
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 3000); return () => clearTimeout(t); }, [confirm]);
  return confirm ? (
    <button onClick={onConfirm} className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-100">Delete?</button>
  ) : (
    <HeaderBtn label="Delete chat" onClick={() => setConfirm(true)}><Trash2 className="size-4" /></HeaderBtn>
  );
}

function EditableTitle({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const commit = () => { setEditing(false); const t = value.trim(); if (t && t !== title) onSave(t); else setValue(title); };
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex items-center gap-1">
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Escape' && (setValue(title), setEditing(false))} maxLength={120} className="h-6 w-full min-w-0 rounded border border-brand-200 px-1.5 text-[13px] font-semibold outline-none ring-2 ring-brand-100" />
        <button type="submit" aria-label="Save title" className="text-brand-600"><Check className="size-4" /></button>
      </form>
    );
  }
  return (
    <button onClick={() => setEditing(true)} title="Rename chat" className="group flex max-w-full items-center gap-1 text-left">
      <span className="truncate text-[13.5px] font-semibold">{title}</span>
      <Pencil className="size-3 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function ChatList({ chats, onOpen, onDelete, onNew }: { chats?: ChatThread[]; onOpen: (id: string) => void; onDelete: (id: string) => void; onNew: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <button onClick={onNew} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-[13px] font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-700">
        <MessageSquarePlus className="size-4" />New chat
      </button>
      {!chats && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="my-2 h-12" />)}
      <ul className="space-y-0.5">
        {chats?.map((c) => <ChatRow key={c.id} chat={c} onOpen={onOpen} onDelete={onDelete} />)}
      </ul>
    </div>
  );
}

function ChatRow({ chat, onOpen, onDelete }: { chat: ChatThread; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 3000); return () => clearTimeout(t); }, [confirm]);
  const questions = Math.ceil(chat.messageCount / 2);
  return (
    <li className="group relative">
      <button onClick={() => onOpen(chat.id)} className="w-full rounded-lg px-3 py-2.5 pr-10 text-left transition hover:bg-slate-50">
        <span className="block truncate text-[13.5px] font-medium text-slate-800">{chat.title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-slate-500">
          {relativeTime(chat.updatedAt)} · {questions ? `${questions} question${questions > 1 ? 's' : ''}` : 'No messages yet'}
        </span>
      </button>
      <button
        onClick={() => (confirm ? onDelete(chat.id) : setConfirm(true))}
        aria-label={confirm ? 'Confirm delete' : 'Delete chat'}
        title={confirm ? 'Click again to delete' : 'Delete chat'}
        className={cn('absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition', confirm ? 'bg-red-50 text-red-600' : 'text-slate-300 opacity-0 hover:bg-slate-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100')}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function Bubble({ msg, onSeek, onOpenPdf }: { msg: ChatMessage; onSeek: (t: number) => void; onOpenPdf: (p: number, documentId?: string) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="ml-8 animate-fade-in">
        {msg.selection && (
          <button onClick={() => onSeek(msg.selection!.start)} className="mb-1 ml-auto flex w-fit items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-800 ring-1 ring-amber-100 hover:bg-amber-100" title="Play the selected part">
            <Scissors className="size-3" />{rangeLabel(msg.selection)}
          </button>
        )}
        <div className={cn('whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-[13.5px] leading-relaxed text-white', msg.id.startsWith('tmp-') && 'opacity-80')}>{msg.content}</div>
      </div>
    );
  }
  return (
    <div className="mr-1 animate-fade-in">
      <Markdown content={msg.content} onSeek={onSeek} onOpenPdf={onOpenPdf} />
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
}
