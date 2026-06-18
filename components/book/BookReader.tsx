"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Card, Pill } from "@/components/ui";
import { BlankInput } from "@/components/book/BlankInput";
import type { Verdict } from "@/lib/grade";
import type { BookPage, Exercise } from "@/lib/book";

type AnswerRec = { value: string; verdict: Verdict };
type BookProgress = Record<string, Record<string, AnswerRec>>; // exId -> item-blank -> rec

const keyOf = (exId: string, item: number, idx: number) => `${item}.${idx}`;
const ACCENTS = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];

export function BookReader({
  page,
  exercises,
  prev,
  next,
  sectionTitle,
  hasVocab,
  sections,
}: {
  page: BookPage;
  exercises: Exercise[];
  prev: number | null;
  next: number | null;
  sectionTitle?: string | null;
  hasVocab?: boolean;
  sections?: { title: string; pdfPage: number }[];
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, unknown>>({});
  const [reveal, setReveal] = useState(false);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInput = useRef<HTMLInputElement | null>(null);

  // Insert a character into whichever blank was last focused, keeping React's
  // controlled state in sync (native value setter + dispatched input event).
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

  // Load full app state once.
  useEffect(() => {
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => { setState(s || {}); loaded.current = true; })
      .catch(() => { loaded.current = true; });
  }, []);

  const progress: BookProgress = ((state.book as { answers?: BookProgress } | undefined)?.answers) || {};

  const onBlankChange = useCallback(
    (exId: string, item: number, idx: number, value: string, verdict: Verdict) => {
      setState((cur) => {
        const book = (cur.book as { answers?: BookProgress }) || {};
        const answers = { ...(book.answers || {}) };
        answers[exId] = { ...(answers[exId] || {}), [keyOf(exId, item, idx)]: { value, verdict } };
        const nextState = { ...cur, book: { ...book, answers } };
        // persist (debounced) — reuse save without double setState
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

  // Per-page score across gradable blanks.
  const gradable = page.blanks.filter((b) => b.gradable);
  const correct = gradable.filter((b) => progress[b.exId]?.[keyOf(b.exId, b.item, b.blankIdx)]?.verdict === "correct").length;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-4">
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/course"><Button variant="ghost">← Contents</Button></Link>
          {hasVocab && page.unit != null && (
            <Link href={`/vocab/${page.unit}`}><Button variant="ghost">Vocab</Button></Link>
          )}
          <span className="text-sm font-semibold text-slate-700">
            {page.section}
            {sectionTitle ? <span className="font-normal text-slate-500"> · {sectionTitle}</span> : null}
            {page.printedPage >= 1 ? <span className="font-normal text-slate-400"> · p{page.printedPage}</span> : null}
          </span>
          {gradable.length > 0 && (
            <Pill tone={correct === gradable.length ? "green" : "indigo"}>
              {correct}/{gradable.length} correct
            </Pill>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant={reveal ? "success" : "secondary"} onClick={() => setReveal((r) => !r)}>
            {reveal ? "Hide answers" : "Reveal answers"}
          </Button>
          {sections && sections.length > 0 && (
            <select
              aria-label="Jump to section"
              value=""
              onChange={(e) => { if (e.target.value) router.push(`/book/${e.target.value}`); }}
              className="max-w-[12rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-600"
            >
              <option value="">Jump to section…</option>
              {sections.map((s) => (
                <option key={s.pdfPage} value={s.pdfPage}>{s.title}</option>
              ))}
            </select>
          )}
          {prev != null ? (
            <Link href={`/book/${prev}`}><Button variant="secondary">← Prev</Button></Link>
          ) : <Button variant="secondary" disabled>← Prev</Button>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(new FormData(e.currentTarget).get("p"));
              if (n >= 1) router.push(`/book/${n + 12}`); // printed -> pdf page
            }}
            className="flex items-center gap-1"
          >
            <input
              name="p"
              type="number"
              min={1}
              defaultValue={page.printedPage >= 1 ? page.printedPage : undefined}
              aria-label="Go to printed page"
              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <Button type="submit" variant="secondary">Go</Button>
          </form>
          {next != null ? (
            <Link href={`/book/${next}`}><Button variant="secondary">Next →</Button></Link>
          ) : <Button variant="secondary" disabled>Next →</Button>}
        </div>
      </div>

      {/* the real page with the interactive overlay */}
      <Card className="overflow-hidden p-0">
        <div className="relative w-full select-none">
          <Image
            src={page.image}
            alt={`Page ${page.printedPage}`}
            width={page.w ?? 1506}
            height={page.h ?? 1925}
            className="block w-full"
            // Pre-rendered page scans served as-is from /public — skip the Next
            // image optimizer (it 400s on these in standalone output and adds no
            // value since we always display them full-width).
            unoptimized
            priority
          />
          <div
            className="absolute inset-0"
            onFocusCapture={(e) => {
              if (e.target instanceof HTMLInputElement) lastInput.current = e.target;
            }}
          >
            {page.blanks.map((b) => {
              const k = keyOf(b.exId, b.item, b.blankIdx);
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

      {page.blanks.length > 0 && (
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

      {exercises.some((e) => e.type === "personal" || e.type === "free") && (
        <p className="mt-3 text-xs text-slate-500">
          Tip: italicized <span className="font-medium">personal</span> exercises have no single
          right answer — type your own response; they aren&apos;t graded.
        </p>
      )}
    </div>
  );
}
