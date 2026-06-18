"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, Card, Pill } from "@/components/ui";
import { BlankInput } from "@/components/book/BlankInput";
import type { Verdict } from "@/lib/grade";
import type { BookPage } from "@/lib/book";

type AnswerRec = { value: string; verdict: Verdict };
type BookProgress = Record<string, Record<string, AnswerRec>>;
const keyOf = (item: number, idx: number) => `${item}.${idx}`;
const ACCENTS = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];

export function UnitReader({
  unit,
  unitTitle,
  pages,
  sections,
  nextUnit,
}: {
  unit: number;
  unitTitle: string;
  pages: BookPage[];
  sections: { title: string; pdfPage: number }[];
  nextUnit: number | null;
}) {
  const [state, setState] = useState<Record<string, unknown>>({});
  const [reveal, setReveal] = useState(false);
  const lastInput = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => setState(s || {}))
      .catch(() => {});
  }, []);

  const progress: BookProgress = ((state.book as { answers?: BookProgress } | undefined)?.answers) || {};

  const onBlankChange = useCallback(
    (exId: string, item: number, idx: number, value: string, verdict: Verdict) => {
      setState((cur) => {
        const book = (cur.book as { answers?: BookProgress }) || {};
        const answers = { ...(book.answers || {}) };
        answers[exId] = { ...(answers[exId] || {}), [keyOf(item, idx)]: { value, verdict } };
        const nextState = { ...cur, book: { ...book, answers } };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch("/api/state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(nextState),
          }).catch(() => {});
        }, 500);
        return nextState;
      });
    },
    []
  );

  const insertChar = useCallback((ch: string) => {
    const el = lastInput.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nv = el.value.slice(0, start) + ch + el.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, nv);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(start + ch.length, start + ch.length);
  }, []);

  const allBlanks = pages.flatMap((p) => p.blanks);
  const gradable = allBlanks.filter((b) => b.gradable);
  const correct = gradable.filter(
    (b) => progress[b.exId]?.[keyOf(b.item, b.blankIdx)]?.verdict === "correct"
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-4">
      {/* sticky toolbar */}
      <div className="sticky top-0 z-30 -mx-3 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link href="/course"><Button variant="ghost">← Contents</Button></Link>
          <span className="text-sm font-semibold text-slate-700">Unit {unit}</span>
          {gradable.length > 0 && (
            <Pill tone={correct === gradable.length ? "green" : "indigo"}>
              {correct}/{gradable.length}
            </Pill>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sections.length > 0 && (
            <select
              aria-label="Jump to section"
              value=""
              onChange={(e) => {
                const el = document.getElementById(`p${e.target.value}`);
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
            >
              <option value="">Jump to section…</option>
              {sections.map((s) => (
                <option key={s.pdfPage} value={s.pdfPage}>{s.title}</option>
              ))}
            </select>
          )}
          <Button variant={reveal ? "success" : "secondary"} onClick={() => setReveal((r) => !r)}>
            {reveal ? "Hide answers" : "Reveal answers"}
          </Button>
        </div>
      </div>

      <h1 className="mb-3 px-1 text-lg font-bold text-slate-900">
        <span className="text-indigo-600">Unit {unit}</span> · {unitTitle}
      </h1>

      {/* the whole unit, page after page */}
      <div className="space-y-2">
        {pages.map((page) => (
          <div key={page.pdfPage} id={`p${page.pdfPage}`} className="scroll-mt-16">
            <Card className="overflow-hidden p-0">
              <div className="relative w-full select-none">
                <Image
                  src={page.image}
                  alt={`Page ${page.printedPage}`}
                  width={page.w ?? 1506}
                  height={page.h ?? 1925}
                  className="block w-full"
                  unoptimized
                />
                <div
                  className="absolute inset-0"
                  onFocusCapture={(e) => {
                    if (e.target instanceof HTMLInputElement) lastInput.current = e.target;
                  }}
                >
                  {page.blanks.map((b) => {
                    const k = keyOf(b.item, b.blankIdx);
                    const rec = progress[b.exId]?.[k];
                    return (
                      <BlankInput
                        key={`${b.exId}-${k}`}
                        blank={b}
                        value={rec?.value ?? ""}
                        reveal={reveal}
                        onChange={(v, verdict) => onBlankChange(b.exId, b.item, b.blankIdx, v, verdict)}
                      />
                    );
                  })}
                </div>
              </div>
            </Card>
            <p className="py-1 text-center text-xs text-slate-400">page {page.printedPage}</p>
          </div>
        ))}
      </div>

      {/* end of unit */}
      <div className="my-8 flex flex-col items-center gap-3">
        {nextUnit != null ? (
          <Link href={`/unit/${nextUnit}`}>
            <Button className="px-8 py-3 text-base">Unit {nextUnit} →</Button>
          </Link>
        ) : (
          <p className="text-sm text-slate-500">End of the book 🎉</p>
        )}
        <Link href="/course" className="text-sm text-indigo-600 hover:underline">← Back to contents</Link>
      </div>

      {/* floating accent bar */}
      {allBlanks.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur">
            <span className="px-1 text-xs text-slate-400">accents</span>
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertChar(a); }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm hover:bg-slate-100"
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
