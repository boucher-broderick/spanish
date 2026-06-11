"use client";
import { useEffect, useMemo, useState } from "react";
import { WritingGrade, WritingPromptRow } from "@/lib/composition";
import { Button, Card, Pill, cx } from "../ui";
import { Criteria, CriteriaControls, DEFAULT_CRITERIA, levelLabel, tenseLabel } from "./controls";

export function Writing({ onExit }: { onExit: () => void }) {
  const [prompts, setPrompts] = useState<WritingPromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [crit, setCrit] = useState<Criteria>(DEFAULT_CRITERIA);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/writing")
      .then((r) => (r.ok ? r.json() : { prompts: [] }))
      .then((d) => setPrompts(d.prompts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => prompts.find((p) => p.id === activeId) ?? null, [prompts, activeId]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/writing/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: crit.level, tense: crit.tense, topic: crit.topic || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to generate prompt");
      setPrompts((ps) => [d.prompt, ...ps]);
      setActiveId(d.prompt.id);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGenerating(false);
    }
  }

  function onAttemptSaved(promptId: string, attempt: WritingPromptRow["attempts"][number]) {
    setPrompts((ps) => ps.map((p) => (p.id === promptId ? { ...p, attempts: [...p.attempts, attempt] } : p)));
  }

  async function remove(id: string) {
    setPrompts((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
    await fetch(`/api/writing/${id}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button onClick={active ? () => setActiveId(null) : onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Back
      </button>

      {active ? (
        <PromptWorkspace prompt={active} onSaved={onAttemptSaved} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h1 className="text-xl font-bold text-slate-900">✍️ Writing</h1>
            <p className="text-sm text-slate-500">
              Pick a level &amp; tense and get a prompt to write about. Grade it when you&apos;re done — then retry the same prompt as a new variation.
            </p>
            <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} />
            <Button className="w-full" onClick={generate} disabled={generating}>
              {generating ? "Thinking of a prompt…" : "Generate a prompt"}
            </Button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Your prompts</h2>
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : prompts.length === 0 ? (
              <p className="text-sm text-slate-400">No prompts yet.</p>
            ) : (
              <div className="space-y-2">
                {prompts.map((p) => (
                  <Card key={p.id} className="p-3">
                    <button className="block w-full text-left" onClick={() => setActiveId(p.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{p.topic ?? "Untitled"}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Pill tone="indigo">{levelLabel(p.level).split(" ")[0]}</Pill>
                          <Pill>{p.attempts.length} var.</Pill>
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.prompt}</p>
                    </button>
                    <div className="mt-2 text-right">
                      <button onClick={() => remove(p.id)} className="text-xs text-rose-500 hover:text-rose-700">
                        Delete
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PromptWorkspace({
  prompt,
  onSaved,
}: {
  prompt: WritingPromptRow;
  onSaved: (promptId: string, attempt: WritingPromptRow["attempts"][number]) => void;
}) {
  // tab: an attempt index, or "new"
  const [tab, setTab] = useState<number | "new">(prompt.attempts.length ? prompt.attempts.length - 1 : "new");
  const [showEn, setShowEn] = useState(false);
  const [draft, setDraft] = useState("");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");

  async function grade() {
    if (!draft.trim()) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch("/api/writing/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, prompt: prompt.prompt, body: draft, level: prompt.level, tense: prompt.tense }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to grade");
      onSaved(prompt.id, d.attempt);
      setDraft("");
      setTab(prompt.attempts.length); // the newly appended attempt
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Pill tone="indigo">{levelLabel(prompt.level)}</Pill>
          <Pill>{tenseLabel(prompt.tense)}</Pill>
        </div>
        <h1 className="text-lg font-bold text-slate-900">{prompt.topic ?? "Writing prompt"}</h1>
      </div>

      <Card className="p-4">
        <p className="leading-relaxed text-slate-800">{showEn ? prompt.promptEn ?? prompt.prompt : prompt.prompt}</p>
        {prompt.promptEn && (
          <button onClick={() => setShowEn((s) => !s)} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            {showEn ? "Ver en español" : "Show English"}
          </button>
        )}
      </Card>

      {/* variation tabs */}
      <div className="flex flex-wrap gap-1.5">
        {prompt.attempts.map((_, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={cx(
              "rounded-lg px-3 py-1 text-sm font-medium",
              tab === i ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
            )}
          >
            Variation {i + 1}
          </button>
        ))}
        <button
          onClick={() => setTab("new")}
          className={cx(
            "rounded-lg px-3 py-1 text-sm font-medium",
            tab === "new" ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50"
          )}
        >
          + New attempt
        </button>
      </div>

      {tab === "new" ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="Escribe aquí…"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{draft.trim().split(/\s+/).filter(Boolean).length} words</span>
            <Button onClick={grade} disabled={!draft.trim() || grading}>
              {grading ? "Grading…" : "Grade & save"}
            </Button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      ) : (
        <AttemptView attempt={prompt.attempts[tab]} />
      )}
    </div>
  );
}

function AttemptView({ attempt }: { attempt: WritingPromptRow["attempts"][number] }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">What you wrote</div>
        <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{attempt.body}</p>
      </Card>
      {attempt.grade ? <GradeView grade={attempt.grade} /> : <p className="text-sm text-slate-400">No grade saved.</p>}
    </div>
  );
}

function GradeView({ grade }: { grade: WritingGrade }) {
  const tone = grade.score >= 85 ? "text-emerald-600" : grade.score >= 60 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-4 p-4">
        <div className={cx("text-3xl font-bold", tone)}>{grade.score}</div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-700">Demonstrates ~{grade.level_estimate}</div>
          <p className="text-sm text-slate-500">{grade.summary}</p>
        </div>
      </Card>

      {grade.errors.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Fixes ({grade.errors.length})
          </div>
          <div className="space-y-2">
            {grade.errors.map((e, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-rose-600 line-through">{e.original}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-emerald-700">{e.correction}</span>
                  <Pill>{e.type}</Pill>
                </div>
                <p className="mt-1 text-sm text-slate-500">{e.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Corrected version</div>
        <Card className="p-4">
          <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{grade.corrected}</p>
        </Card>
      </div>
    </div>
  );
}
