"use client";
import { useMemo, useState } from "react";
import { GROUP_MAIN_GAME, GROUPS, ProgressState, SET_SIZE, Word } from "@/lib/domain";
import { TENSES, Tense } from "@/lib/conjugation/types";
import { wordsByGroup } from "@/lib/words";
import { accuracy, getStat, isReview } from "@/lib/progress";
import { Button, Card, Pill } from "./ui";

export function Settings({
  state,
  onClose,
  updateSettings,
  doResetExercise,
  doResetWord,
}: {
  state: ProgressState;
  onClose: () => void;
  updateSettings: (patch: Partial<ProgressState["settings"]>) => void;
  doResetExercise: (ex: "conjugation") => void;
  doResetWord: (wordId: string) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());

  function toggleTense(t: Tense) {
    const has = state.settings.tenses.includes(t);
    const next = has ? state.settings.tenses.filter((x) => x !== t) : [...state.settings.tenses, t];
    if (next.length === 0) return; // keep at least one
    updateSettings({ tenses: TENSES.filter((d) => next.includes(d.id)).map((d) => d.id) });
  }

  // Viewed words, per group, bucketed into 20-word sets by rank.
  const sections = useMemo(() => {
    const viewed = new Set(Object.keys(state.words));
    return GROUPS.map((group) => {
      const buckets: Word[][] = [];
      wordsByGroup(group).forEach((w, i) => {
        if (!viewed.has(w.id)) return;
        const set = Math.floor(i / SET_SIZE);
        (buckets[set] ||= []).push(w);
      });
      return { group, buckets };
    }).filter((s) => s.buckets.some((b) => b && b.length));
  }, [state.words]);

  function toggle(ids: string[], on: boolean) {
    setSel((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  const allViewed = sections.flatMap((s) => s.buckets.flat().filter(Boolean).map((w) => w.id));

  function resetSelected() {
    if (sel.size === 0) return;
    if (!confirm(`Reset stats for ${sel.size} word(s)?`)) return;
    sel.forEach((id) => doResetWord(id));
    setSel(new Set());
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center overflow-y-auto bg-slate-900/40 p-3">
      <div className="mt-6 mb-10 w-full max-w-lg">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Settings</h2>
            <button onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Done
            </button>
          </div>

          {/* Tenses */}
          <section className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700">Tenses (Verb Conjugation)</h3>
            <p className="mb-2 text-xs text-slate-500">Shown side-by-side as columns. At least one.</p>
            <div className="flex flex-wrap gap-2">
              {TENSES.map((t) => {
                const on = state.settings.tenses.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTense(t.id)}
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm " +
                      (on
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-300 bg-white text-slate-600")
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => {
                if (confirm("Reset Conjugation stats for ALL words?")) doResetExercise("conjugation");
              }}
            >
              Reset all Conjugation stats
            </Button>
          </section>

          {/* Reset progress by set */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Reset progress</h3>
              {allViewed.length > 0 && (
                <button
                  onClick={() => toggle(allViewed, sel.size !== allViewed.length)}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  {sel.size === allViewed.length ? "Clear selection" : "Select all"}
                </button>
              )}
            </div>
            {sections.length === 0 && (
              <p className="text-xs text-slate-500">No practiced words yet.</p>
            )}

            <div className="space-y-4">
              {sections.map(({ group, buckets }) => (
                <div key={group}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</div>
                  {buckets.map((bucket, setIdx) => {
                    if (!bucket || bucket.length === 0) return null;
                    const ids = bucket.map((w) => w.id);
                    const allOn = ids.every((id) => sel.has(id));
                    const main = GROUP_MAIN_GAME[group];
                    return (
                      <div key={setIdx} className="mb-2 rounded-xl border border-slate-200">
                        <button
                          onClick={() => toggle(ids, !allOn)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700"
                        >
                          <span>
                            Set {setIdx + 1}
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              words {setIdx * SET_SIZE + 1}–{(setIdx + 1) * SET_SIZE}
                            </span>
                          </span>
                          <span className="text-xs text-indigo-600">{allOn ? "✓ all" : "select set"}</span>
                        </button>
                        <div className="border-t border-slate-100">
                          {bucket.map((w) => {
                            const s = getStat(state, w.id, main);
                            return (
                              <label
                                key={w.id}
                                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={sel.has(w.id)}
                                  onChange={(e) => toggle([w.id], e.target.checked)}
                                />
                                <span className="flex-1 text-slate-700">
                                  <b>{w.spanish}</b> · {w.english}
                                </span>
                                {isReview(state, w.id) && <Pill tone="green">review</Pill>}
                                <span className="text-xs text-slate-400">
                                  {s.attempts} att · {Math.round(accuracy(s) * 100)}%
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {allViewed.length > 0 && (
              <Button variant="danger" className="mt-3 w-full" disabled={sel.size === 0} onClick={resetSelected}>
                Reset selected ({sel.size})
              </Button>
            )}
          </section>
        </Card>
      </div>
    </div>
  );
}
