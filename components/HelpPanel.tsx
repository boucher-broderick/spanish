"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { readTextStream } from "@/lib/read-stream";
import type { ChatMessage } from "@/lib/composition";

// App-wide "ask an LLM if I'm confused" panel — a floating button that opens a
// slide-out chat drawer (like Claude Code's editor tab). Page-aware: passes the
// current path to the tutor so answers can reference where you are. Streams from
// /api/ask. Mounted once in the root layout.
export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  // Don't show the help button on the login screen.
  if (pathname === "/login") return null;

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
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: base, context: pathname }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
      let acc = "";
      await readTextStream(res, (chunk) => {
        acc += chunk;
        setMessages((m) => { const next = [...m]; next[replyIdx] = { role: "assistant", content: acc }; return next; });
      });
    } catch (e) {
      setError(String((e as Error).message));
      setMessages(base);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700"
          aria-label="Ask a question"
        >
          💬 Ask
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Ask the tutor</h2>
              <p className="text-xs text-slate-400">Stuck on something? Ask in plain English.</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-slate-400">e.g. &quot;When do I use ser vs estar?&quot; or &quot;Explain the preterite of ir.&quot;</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cx(
                  "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                )}>
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && <p className="px-4 pb-1 text-sm text-rose-600">{error}</p>}

          <div className="border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask a question…"
                className="flex-1 resize-none rounded-xl border-2 border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <Button onClick={send} disabled={streaming || !input.trim()}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
