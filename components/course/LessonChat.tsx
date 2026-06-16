"use client";
import { useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { PRACTICE_KINDS, type ChatMessage, type PracticeKind } from "@/lib/course";

export function LessonChat({
  lessonId,
  onStartPractice,
}: {
  lessonId: string;
  onStartPractice: (kind: PracticeKind) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<{ kind: PracticeKind; count?: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/course/lessons/${lessonId}/chat`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => alive && setMessages(d.messages ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lessonId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError("");
    setSuggestion(null);
    setSending(true);
    // Optimistic echo of the student's message.
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: text, createdAt: "" };
    setMessages((m) => [...m, optimistic]);
    try {
      const r = await fetch(`/api/course/lessons/${lessonId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to send");
      // Replace the optimistic message with the persisted pair.
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...(d.messages ?? [])]);
      if (d.suggestPractice) setSuggestion(d.suggestPractice);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setError(String((e as Error).message));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Ask your teacher anything about this lesson — for a rule, more examples, or a quick drill.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-slate-400">Teacher is typing…</div>}
        <div ref={endRef} />
      </div>

      {suggestion && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            onStartPractice(suggestion.kind);
            setSuggestion(null);
          }}
        >
          ✏️ Generate this drill ({PRACTICE_KINDS.find((k) => k.id === suggestion.kind)?.label ?? suggestion.kind})
        </Button>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ask a question…"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <Button onClick={send} disabled={!input.trim() || sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
