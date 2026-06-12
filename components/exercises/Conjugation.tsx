"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Word } from "@/lib/domain";
import { conjugate } from "@/lib/conjugation/engine";
import { PERSONS, SHOWN_PERSON_INDICES, TENSES, Tense } from "@/lib/conjugation/types";
import { matchesLoose } from "@/lib/text";
import { Button } from "../ui";
import { Phase } from "./shared";

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

  const tenseDefs = TENSES.filter((t) => tenses.includes(t.id));

  // Flat, ordered list of every cell for Enter-to-next navigation. Column-major:
  // go down all persons of a tense, then on to the next tense.
  const rows = SHOWN_PERSON_INDICES.length;
  const navIndex = (tIdx: number, rowIdx: number) => tIdx * rows + rowIdx;
  const cellCount = tenseDefs.length * rows;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Parent remounts via key per word, so state resets naturally — just focus.
  useEffect(() => {
    inputs.current[0]?.focus();
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
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-slate-900">{word.lemma}</span>
        <span className="text-base text-slate-500">— {word.english}</span>
      </div>

      <div
        className="grid items-center gap-x-2 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
        style={{ gridTemplateColumns: `minmax(2.75rem,auto) repeat(${tenseDefs.length}, minmax(0,1fr))` }}
      >
        {/* Header row: tense names once, instead of repeating per cell. */}
        <div />
        {tenseDefs.map((t) => (
          <span key={t.id} className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {t.short}
          </span>
        ))}

        {SHOWN_PERSON_INDICES.map((p, rowIdx) => (
          <Fragment key={p}>
            <span className="pr-1 text-sm font-semibold text-slate-500">{PERSONS[p].label}</span>
            {tenseDefs.map((t, tIdx) => {
              const ok = cellCorrect(t.id, p);
              const idx = navIndex(tIdx, rowIdx);
              return (
                <div key={t.id}>
                  <input
                    ref={(el) => {
                      inputs.current[idx] = el;
                    }}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    readOnly={phase === "feedback"}
                    value={values[key(t.id, p)] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key(t.id, p)]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      // After grading, one more Enter goes to the next verb.
                      if (phase === "feedback") {
                        onResult(allCorrect);
                        return;
                      }
                      // Move down the cells; the last one checks the card.
                      if (idx < cellCount - 1) inputs.current[idx + 1]?.focus();
                      else submit();
                    }}
                    className={
                      "w-full rounded-md border px-2.5 py-1.5 text-base outline-none focus:ring-2 " +
                      (phase === "feedback"
                        ? ok
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200")
                    }
                  />
                  {phase === "feedback" && !ok && (
                    <span className="mt-0.5 block text-xs font-medium text-slate-600">{table[t.id][p]}</span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {phase === "input" ? (
        <Button onClick={submit} disabled={filledCount === 0} className="w-full">
          Check card
        </Button>
      ) : (
        <div className="space-y-2">
          <div
            className={
              "rounded-lg px-3 py-2 text-sm font-semibold " +
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
