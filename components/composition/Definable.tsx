"use client";
import { useEffect, useRef, useState } from "react";

interface Pop {
  x: number;
  y: number;
  word: string;
  def: string;
  loading: boolean;
}

// Wraps any text content so that double-clicking (or selecting) a word looks up
// its meaning via /api/define and shows it in a small popover.
export function Definable({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function lookup() {
      const sel = window.getSelection();
      const raw = sel?.toString().trim() ?? "";
      const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""); // trim surrounding punctuation
      if (!word || word.split(/\s+/).length > 4) return;
      const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
      const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect ? rect.top : 100;
      setPop({ x, y, word, def: "", loading: true });
      fetch("/api/define", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: word }),
      })
        .then((r) => r.json())
        .then((d) => setPop((p) => (p && p.word === word ? { ...p, loading: false, def: d.definition ?? "no definition" } : p)))
        .catch(() => setPop((p) => (p && p.word === word ? { ...p, loading: false, def: "no definition" } : p)));
    }

    el.addEventListener("dblclick", lookup);
    return () => el.removeEventListener("dblclick", lookup);
  }, []);

  // Dismiss on Escape, scroll, or a click outside the popover.
  useEffect(() => {
    if (!pop) return;
    const close = () => setPop(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    const t = setTimeout(() => window.addEventListener("mousedown", close, { once: true }), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("mousedown", close);
      clearTimeout(t);
    };
  }, [pop]);

  return (
    <div ref={ref} className="relative">
      {children}
      {pop && (
        <div
          style={{ position: "fixed", left: pop.x, top: pop.y - 8, transform: "translate(-50%, -100%)", zIndex: 50 }}
          className="pointer-events-none max-w-xs rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white shadow-lg"
        >
          <span className="font-semibold">{pop.word}</span>
          {" — "}
          {pop.loading ? <span className="text-slate-300">…</span> : <span>{pop.def}</span>}
        </div>
      )}
    </div>
  );
}
