"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Word } from "@/lib/domain";
import { conjugate } from "@/lib/conjugation/engine";
import { PERSONS, SHOWN_PERSON_INDICES, TENSES, Tense } from "@/lib/conjugation/types";
import { matchesLoose } from "@/lib/text";
import { Button } from "../ui";
import { Phase, PromptHeader } from "./shared";

// Verb Conjugation: fill every shown person across the selected tenses. One attempt
// per card — counts correct only if EVERY cell is right (accent-tolerant matching).
export function Conjugation({
  word,
  tenses,
  onResult,
}: {
  word: Word;
  tenses: Tense[];
  onResult: (correct: boolean) => void;
}) {
  const table = useMemo(() => conjugate(word.lemma), [word.lemma]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("input");
  const firstRef = useRef<HTMLInputElement>(null);

  const tenseDefs = TENSES.filter((t) => tenses.includes(t.id));

  // Parent remounts via key per word, so state resets naturally — just focus.
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const key = (t: Tense, p: number) => `${t}:${p}`;
  const cellCorrect = (t: Tense, p: number) => matchesLoose(values[key(t, p)] ?? "", table[t][p]);
  const allCorrect = tenseDefs.every((t) => SHOWN_PERSON_INDICES.every((p) => cellCorrect(t.id, p)));
  const filledCount = tenseDefs.reduce(
    (n, t) => n + SHOWN_PERSON_INDICES.filter((p) => (values[key(t.id, p)] ?? "").trim()).length,
    0
  );

  function submit() {
    if (filledCount === 0) return;
    setPhase("feedback");
  }

  return (
    <div className="space-y-4">
      <PromptHeader eyebrow="Verb Conjugation">
        <span className="font-semibold">{word.lemma}</span>
        <span className="ml-2 text-base text-slate-500">— {word.english}</span>
      </PromptHeader>

      <div className="space-y-2">
        {SHOWN_PERSON_INDICES.map((p, rowIdx) => (
          <div key={p} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-slate-500">{PERSONS[p].label}</div>
            <div className="flex flex-wrap gap-2">
              {tenseDefs.map((t) => {
                const ok = cellCorrect(t.id, p);
                return (
                  <label key={t.id} className="flex-1 min-w-36">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t.short}
                    </span>
                    <input
                      ref={rowIdx === 0 && t.id === tenseDefs[0].id ? firstRef : undefined}
                      type="text"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      readOnly={phase === "feedback"}
                      value={values[key(t.id, p)] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key(t.id, p)]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && phase === "input") submit();
                      }}
                      className={
                        "w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2 " +
                        (phase === "feedback"
                          ? ok
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-rose-300 bg-rose-50 text-rose-800"
                          : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200")
                      }
                    />
                    {phase === "feedback" && !ok && (
                      <span className="mt-1 block text-xs font-medium text-slate-600">{table[t.id][p]}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {phase === "input" ? (
        <Button onClick={submit} disabled={filledCount === 0} className="w-full">
          Check card
        </Button>
      ) : (
        <div className="space-y-3">
          <div
            className={
              "rounded-xl px-4 py-3 text-sm font-semibold " +
              (allCorrect ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")
            }
          >
            {allCorrect ? "✓ Whole card correct" : "✗ Some cells were off — corrections shown above"}
          </div>
          <Button onClick={() => onResult(allCorrect)} variant={allCorrect ? "success" : "primary"} className="w-full">
            Next verb
          </Button>
        </div>
      )}
    </div>
  );
}
