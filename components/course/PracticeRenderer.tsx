"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Pill, cx } from "@/components/ui";
import { Segmented } from "@/components/composition/controls";
import { AccentBar } from "@/components/AccentBar";
import { AnswerFooter, AnswerInput, PromptHeader, type Phase } from "@/components/exercises/shared";
import { matchesLoose, matchesStrict } from "@/lib/text";
import { PRACTICE_KINDS, type ItemResult, type PracticeItem, type PracticeKind, type PracticeSpec } from "@/lib/course";

// ---- local grading ----
function gradeLocal(item: PracticeItem, value: string): boolean {
  const match = item.accentSensitive ? matchesStrict : matchesLoose;
  const targets = [item.answer, ...(item.acceptable ?? [])];
  return targets.some((t) => match(value, t));
}
// Free-form (or reason-bearing) items are graded by Gemini at the end.
function needsGemini(item: PracticeItem): boolean {
  return item.grade === "gemini" || item.type === "fillBlankReason";
}
function isChoice(item: PracticeItem): boolean {
  return item.type === "multipleChoice" || item.type === "chooseTwo";
}
function isTextArea(item: PracticeItem): boolean {
  return item.type === "translate" || item.type === "shortAnswer" || item.type === "correction";
}

interface Response {
  value: string;
  reason?: string;
  localCorrect?: boolean; // set for items we can grade offline
}

// ---- the runner: pick a drill kind, generate, then play it ----
export function PracticeRunner({
  lessonId,
  request,
  onComplete,
}: {
  lessonId: string;
  request?: { kind: PracticeKind; nonce: number } | null;
  onComplete?: () => void;
}) {
  const [spec, setSpec] = useState<PracticeSpec | null>(null);
  const [kind, setKind] = useState<PracticeKind>("fillBlank");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const handledNonce = useRef<number | null>(null);

  // Load the latest saved spec once.
  useEffect(() => {
    let alive = true;
    fetch(`/api/course/lessons/${lessonId}/practice`)
      .then((r) => (r.ok ? r.json() : { spec: null }))
      .then((d) => alive && setSpec(d.spec ?? null))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [lessonId]);

  const generate = useCallback(
    async (k: PracticeKind) => {
      setGenerating(true);
      setError("");
      try {
        const r = await fetch(`/api/course/lessons/${lessonId}/practice`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: k }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to generate practice");
        setSpec(d.spec);
      } catch (e) {
        setError(String((e as Error).message));
      } finally {
        setGenerating(false);
      }
    },
    [lessonId]
  );

  // A request from the chat ("Generate this drill") auto-generates that kind once.
  useEffect(() => {
    if (request && request.nonce !== handledNonce.current) {
      handledNonce.current = request.nonce;
      setKind(request.kind);
      setSpec(null);
      generate(request.kind);
    }
  }, [request, generate]);

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  if (spec) {
    return (
      <PracticeRenderer
        key={spec.title + spec.items.length}
        spec={spec}
        onNewDrill={() => setSpec(null)}
        onComplete={onComplete}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Generate a drill. Practice is formative — it helps you learn but doesn&apos;t count toward the lesson gate.
      </p>
      <Segmented label="Drill type" options={PRACTICE_KINDS} value={kind} onChange={setKind} />
      <p className="text-xs text-slate-400">{PRACTICE_KINDS.find((k) => k.id === kind)?.blurb}</p>
      <Button className="w-full" onClick={() => generate(kind)} disabled={generating}>
        {generating ? "Building your drill…" : "Generate practice"}
      </Button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

// ---- the renderer: one item at a time, local + batched-Gemini grading ----
export function PracticeRenderer({
  spec,
  onNewDrill,
  onComplete,
}: {
  spec: PracticeSpec;
  onNewDrill: () => void;
  onComplete?: () => void;
}) {
  const items = spec.items;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("input");
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<Record<string, ItemResult> | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");

  const item = items[idx];
  const cur = responses[item?.id];

  function submit(selected?: string) {
    const v = selected ?? value;
    const localCorrect = needsGemini(item) ? undefined : gradeLocal(item, v);
    setResponses((r) => ({ ...r, [item.id]: { value: v, reason: reason || undefined, localCorrect } }));
    setPhase("feedback");
  }

  async function finish(final: Record<string, Response>) {
    // Items that need a Gemini verdict (free-form answers + justifications).
    const toGrade = items.filter(needsGemini);
    let merged: Record<string, ItemResult> = {};
    for (const it of items) {
      if (!needsGemini(it)) merged[it.id] = { itemId: it.id, correct: !!final[it.id]?.localCorrect };
    }
    if (toGrade.length) {
      setGrading(true);
      try {
        const payload = toGrade.map((it) => ({
          id: it.id,
          type: it.type,
          prompt: it.prompt,
          answer: it.answer,
          response: final[it.id]?.value ?? "",
          reasonPrompt: it.reasonPrompt,
          reasonAnswer: it.reasonAnswer,
          reasonResponse: final[it.id]?.reason ?? "",
        }));
        const r = await fetch(`/api/course/practice/grade`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: payload }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Grading failed");
        for (const res of (d.results ?? []) as ItemResult[]) {
          const it = items.find((x) => x.id === res.itemId);
          // For fill+reason, the blank was graded locally; combine with reason verdict.
          const local = it && it.type === "fillBlankReason" ? !!final[res.itemId]?.localCorrect : true;
          merged[res.itemId] = {
            itemId: res.itemId,
            correct: res.correct && local,
            reasonCorrect: res.reasonCorrect,
            feedback: res.feedback,
          };
        }
      } catch (e) {
        setError(String((e as Error).message));
      } finally {
        setGrading(false);
      }
    }
    setResults(merged);
    onComplete?.(); // a finished drill counts toward the lesson's practice gate
  }

  function next() {
    const final = responses;
    if (idx + 1 >= items.length) {
      finish(final);
      return;
    }
    setIdx((i) => i + 1);
    setPhase("input");
    setValue("");
    setReason("");
  }

  // After grading an item, Enter advances to the next one (matches the games).
  useEffect(() => {
    if (phase !== "feedback") return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  if (!item) return null;

  // ---- summary ----
  if (results) {
    const correct = items.filter((it) => results[it.id]?.correct).length;
    return (
      <div className="space-y-3">
        <Card className="flex items-center gap-4 p-4">
          <div className="text-3xl font-bold text-indigo-600">
            {Math.round((correct / items.length) * 100)}%
          </div>
          <div className="flex-1 text-sm text-slate-600">
            {correct}/{items.length} correct · practice isn&apos;t graded toward lesson completion.
          </div>
        </Card>
        {items.map((it) => {
          const res = results[it.id];
          const r = responses[it.id];
          return (
            <Card key={it.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-800">{it.prompt}</p>
                <Pill tone={res?.correct ? "green" : "amber"}>{res?.correct ? "✓" : "✗"}</Pill>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                You: <span className="text-slate-700">{r?.value || "(blank)"}</span>
                {!res?.correct && (
                  <>
                    {" "}· Answer: <span className="font-medium text-emerald-700">{it.answer}</span>
                  </>
                )}
              </p>
              {res?.feedback && <p className="mt-1 text-xs text-slate-500">{res.feedback}</p>}
              {it.explanation && <p className="mt-1 text-xs text-slate-400">{it.explanation}</p>}
            </Card>
          );
        })}
        <Button className="w-full" onClick={onNewDrill}>
          New drill
        </Button>
      </div>
    );
  }

  // ---- active item ----
  const eyebrow = `${spec.title} · ${idx + 1}/${items.length}`;
  return (
    <div className="space-y-4">
      {grading && <p className="text-sm text-slate-400">Grading your answers…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <PromptHeader eyebrow={eyebrow}>
        <span className="whitespace-pre-wrap">{item.prompt}</span>
        {item.prompt_en && <span className="mt-1 block text-sm text-slate-400">{item.prompt_en}</span>}
      </PromptHeader>

      {isChoice(item) ? (
        <div className="flex flex-col gap-2">
          {(item.options ?? []).map((opt) => {
            const chosen = cur?.value === opt;
            const tone =
              phase === "feedback" && chosen
                ? cur?.localCorrect
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-rose-400 bg-rose-50"
                : "border-slate-300 bg-white hover:bg-slate-50";
            return (
              <button
                key={opt}
                disabled={phase === "feedback"}
                onClick={() => submit(opt)}
                className={cx("rounded-xl border px-4 py-3 text-left text-base text-slate-800", tone)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {isTextArea(item) ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={phase === "feedback"}
              rows={item.type === "shortAnswer" ? 6 : 3}
              placeholder="Escribe aquí…"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          ) : (
            <AnswerInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={phase === "feedback"}
              onKeyDown={(e) => e.key === "Enter" && phase === "input" && value.trim() && submit()}
              placeholder="Type your answer…"
            />
          )}
          {item.type === "fillBlankReason" && (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={phase === "feedback"}
              rows={2}
              placeholder={item.reasonPrompt ?? "Why?"}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          )}
        </div>
      )}

      {/* Choice items grade on click; others use the Check/Next footer. */}
      {!isChoice(item) ? (
        <AnswerFooter
          phase={phase}
          correct={!!cur?.localCorrect}
          reveal={
            needsGemini(item)
              ? "Saved — graded at the end."
              : !cur?.localCorrect && (
                  <>
                    Answer: <span className="font-semibold text-emerald-700">{item.answer}</span>
                  </>
                )
          }
          note={phase === "feedback" && !needsGemini(item) ? item.explanation : undefined}
          onSubmit={() => submit()}
          onNext={next}
          submitDisabled={!value.trim()}
          nextLabel={idx + 1 >= items.length ? "Finish" : "Next"}
        />
      ) : (
        phase === "feedback" && (
          <div className="space-y-2">
            {item.explanation && <p className="text-sm text-slate-500">{item.explanation}</p>}
            <Button onClick={next} variant={cur?.localCorrect ? "success" : "primary"} className="w-full">
              {idx + 1 >= items.length ? "Finish" : "Next"}
            </Button>
          </div>
        )
      )}

      {!isChoice(item) && <AccentBar />}
    </div>
  );
}
