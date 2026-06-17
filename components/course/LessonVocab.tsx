"use client";
import { useEffect, useMemo, useState } from "react";
import type { ProgressApi } from "@/components/useProgress";
import { Button, Card, Pill } from "@/components/ui";
import { getLesson, resolveLessonWords, gateExerciseForPos } from "@/lib/curriculum";
import { exercisePassed } from "@/lib/progress";
import type { ResolvedWord, VocabExample } from "@/lib/course";

// Fetch the cached example-sentence pack for a lesson (keyed by word id).
function useVocabPack(lessonId: string) {
  const [examples, setExamples] = useState<Record<string, VocabExample>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/course/lessons/${lessonId}/vocab`)
      .then((r) => (r.ok ? r.json() : { pack: null }))
      .then((d) => {
        if (!alive) return;
        const map: Record<string, VocabExample> = {};
        for (const it of d.pack?.items ?? []) map[it.id] = it;
        setExamples(map);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [lessonId]);
  return { examples, loading };
}

// Read-only reference list: every lesson word with meaning, an example, and a ✓
// once it's mastered. (Practice happens via the Flashcards / Spelling / Conjugation
// exercise buttons — this panel is just to look through.)
export function LessonVocab({ lessonId, api }: { lessonId: string; api: ProgressApi }) {
  const lesson = getLesson(lessonId)!;
  const words = useMemo(() => resolveLessonWords(lesson), [lesson]);
  const { examples, loading } = useVocabPack(lessonId);
  const mastered = (id: string, pos: string) => exercisePassed(api.state, id, gateExerciseForPos(pos));

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{words.length} words to learn this lesson.</p>
      {loading && <p className="text-xs text-slate-400">Loading examples…</p>}
      <div className="space-y-2">
        {words.map((w) => {
          const ex = examples[w.id];
          return (
            <Card key={w.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{w.spanish}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{w.english}</span>
                  {mastered(w.id, w.pos) && <Pill tone="green">✓</Pill>}
                </span>
              </div>
              {ex && (
                <p className="mt-1 text-sm text-slate-600">
                  <span className="text-slate-800">{ex.example}</span>
                  <span className="block text-xs text-slate-400">{ex.example_en}</span>
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Full-screen flashcard deck for a lesson (its own exercise). Flip → meaning + example.
export function LessonFlashcards({ lessonId, onExit }: { lessonId: string; onExit: () => void }) {
  const lesson = getLesson(lessonId)!;
  const words = useMemo(() => resolveLessonWords(lesson), [lesson]);
  const { examples } = useVocabPack(lessonId);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const w: (ResolvedWord & { ex?: VocabExample }) | undefined = words.length
    ? { ...words[i % words.length], ex: examples[words[i % words.length].id] }
    : undefined;

  function next() {
    setRevealed(false);
    setI((n) => (n + 1) % words.length);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button onClick={onExit} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Lesson
        </button>
        <div className="truncate text-sm font-semibold text-slate-700">{lesson.title} · flashcards</div>
        <div className="min-w-16 text-right text-xs font-semibold text-slate-500">
          {w ? `${(i % words.length) + 1}/${words.length}` : ""}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-4">
        {!w ? (
          <p className="text-sm text-slate-400">No words.</p>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setRevealed((r) => !r)}
              className="flex min-h-60 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
            >
              <span className="text-3xl font-semibold text-slate-900">{w.english}</span>
              {revealed ? (
                <>
                  <span className="text-xl text-indigo-600">{w.spanish}</span>
                  {w.ex && (
                    <span className="mt-2 text-sm text-slate-600">
                      {w.ex.example}
                      <span className="block text-xs text-slate-400">{w.ex.example_en}</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-slate-400">tap to reveal</span>
              )}
              <span className="mt-1 text-xs uppercase tracking-wide text-slate-300">{w.pos}</span>
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRevealed((r) => !r)}>
                {revealed ? "Hide" : "Reveal"}
              </Button>
              <Button className="flex-1" onClick={next}>
                Next
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
