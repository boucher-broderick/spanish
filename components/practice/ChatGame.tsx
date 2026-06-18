"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, cx } from "@/components/ui";
import { readTextStream } from "@/lib/read-stream";
import {
  ChatMessage,
  ChatThread,
  DEFAULT_LEVEL,
  Level,
  LEVELS,
  levelLabel,
} from "@/lib/composition";
import type { UnitIndex } from "@/lib/practice-words";
import { ACCENTS, Segmented } from "./controls";
import { SectionPicker, type Selection } from "./SectionPicker";

interface Active {
  id?: string;
  title: string;
  level: Level;
  words: string[];
  messages: ChatMessage[];
}

export function ChatGame({ sections }: { sections: UnitIndex[] }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [active, setActive] = useState<Active | null>(null);

  // setup state
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL);
  const [sel, setSel] = useState<Selection>({ unit: null, section: null });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch("/api/composition")
      .then((r) => (r.ok ? r.json() : { chats: [] }))
      .then((d) => setThreads(d.chats ?? []))
      .catch(() => {});
  }, []);

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/practice/words", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unit: sel.unit, section: sel.section }),
      });
      const d = await r.json().catch(() => ({ words: [], sectionTitle: null }));
      const label = d.sectionTitle ?? "free chat";
      setActive({ title: `Chat · ${label}`, level, words: d.words ?? [], messages: [] });
    } finally {
      setStarting(false);
    }
  }

  function resume(t: ChatThread) {
    setActive({ id: t.id, title: t.title, level: t.level, words: t.words, messages: t.messages });
  }

  async function remove(id: string) {
    setThreads((ts) => ts.filter((t) => t.id !== id));
    await fetch(`/api/composition?type=chat&id=${id}`, { method: "DELETE" });
  }

  if (active) {
    return (
      <ChatWorkspace
        active={active}
        onBack={() => setActive(null)}
        onSaved={(t) => {
          setActive((a) => (a ? { ...a, id: t.id } : a));
          setThreads((ts) => [t, ...ts.filter((x) => x.id !== t.id)]);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <Link href="/practice"><Button variant="ghost">← Practice</Button></Link>
      <h1 className="mt-3 text-xl font-bold text-slate-900">💬 Chat</h1>
      <p className="mt-1 text-sm text-slate-500">Have a conversation in Spanish. Pick a unit to practice its words, or chat freely.</p>

      <div className="mt-4 space-y-3">
        <Segmented label="Level" options={LEVELS} value={level} onChange={setLevel} />
        <SectionPicker index={sections} value={sel} onChange={setSel} />
        <Button onClick={start} disabled={starting}>{starting ? "Starting…" : "Start a new chat →"}</Button>
      </div>

      {threads.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Past chats</h2>
          {threads.map((t) => (
            <Card key={t.id} className="flex items-center justify-between p-3">
              <button className="flex-1 text-left" onClick={() => resume(t)}>
                <span className="font-semibold text-slate-800">{t.title}</span>
                <span className="ml-2"><Pill tone="indigo">{levelLabel(t.level).split(" ")[0]}</Pill></span>
                <p className="mt-0.5 text-xs text-slate-400">{t.messages.length} messages</p>
              </button>
              <button onClick={() => remove(t.id)} className="ml-2 text-xs text-slate-400 hover:text-rose-600">Delete</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatWorkspace({
  active,
  onBack,
  onSaved,
}: {
  active: Active;
  onBack: () => void;
  onSaved: (t: ChatThread) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(active.messages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const idRef = useRef<string | undefined>(active.id);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  async function persist(msgs: ChatMessage[]) {
    try {
      const r = await fetch("/api/composition/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: idRef.current, title: active.title, level: active.level, words: active.words, messages: msgs }),
      });
      const d = await r.json();
      if (d.thread) { idRef.current = d.thread.id; onSaved(d.thread); }
    } catch { /* best-effort persistence */ }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError("");
    const base = [...messages, { role: "user" as const, content: text }];
    setMessages(base);
    setInput("");
    setStreaming(true);
    const replyIdx = base.length;
    setMessages([...base, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/practice/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: base, level: active.level, words: active.words }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Chat failed");
      let acc = "";
      await readTextStream(res, (chunk) => {
        acc += chunk;
        setMessages((m) => { const next = [...m]; next[replyIdx] = { role: "assistant", content: acc }; return next; });
      });
      const final = [...base, { role: "assistant" as const, content: acc }];
      setMessages(final);
      persist(final);
    } catch (e) {
      setError(String((e as Error).message));
      setMessages(base); // drop the empty assistant bubble
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function insertAccent(ch: string) {
    setInput((v) => v + ch);
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <span className="text-sm font-semibold text-slate-700">{active.title}</span>
      </div>

      {active.words.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">Practicing: {active.words.join(", ")}</p>
      )}

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Say something in Spanish to get started — ¡hola!</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
              m.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-800"
            )}>
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-3">
        <div className="mb-1 flex flex-wrap gap-1">
          {ACCENTS.map((a) => (
            <button key={a} type="button" onMouseDown={(e) => { e.preventDefault(); insertAccent(a); }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm hover:bg-slate-100">{a}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            autoFocus
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escribe en español…"
            className="flex-1 resize-none rounded-xl border-2 border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <Button onClick={send} disabled={streaming || !input.trim()}>Send</Button>
        </div>
      </div>
    </div>
  );
}
