"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, cx } from "@/components/ui";
import {
  Criteria,
  DEFAULT_CRITERIA,
  WritingAttempt,
  WritingPromptRow,
  levelLabel,
  tenseLabel,
} from "@/lib/composition";
import type { UnitIndex } from "@/lib/practice-words";
import { ACCENTS, CriteriaControls } from "./controls";
import { SectionPicker, type Selection } from "./SectionPicker";

export function WritingGame({ sections }: { sections: UnitIndex[] }) {
  const [prompts, setPrompts] = useState<WritingPromptRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [crit, setCrit] = useState<Criteria>(DEFAULT_CRITERIA);
  const [sel, setSel] = useState<Selection>({ unit: null, section: null });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/composition")
      .then((r) => (r.ok ? r.json() : { writing: [] }))
      .then((d) => setPrompts(d.writing ?? []))
      .catch(() => {});
  }, []);

  const active = useMemo(() => prompts.find((p) => p.id === activeId) ?? null, [prompts, activeId]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/practice/writing/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: crit.level, tense: crit.tense, topic: crit.topic || undefined, unit: sel.unit, section: sel.section }),
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

  function onAttempt(promptId: string, attempt: WritingAttempt) {
    setPrompts((ps) => ps.map((p) => (p.id === promptId ? { ...p, attempts: [...p.attempts, attempt] } : p)));
  }

  async function remove(id: string) {
    setPrompts((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
    await fetch(`/api/composition?type=writing&id=${id}`, { method: "DELETE" });
  }

  if (active) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <Button variant="ghost" onClick={() => setActiveId(null)}>← Back</Button>
        <PromptWorkspace prompt={active} onSaved={onAttempt} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <Link href="/practice"><Button variant="ghost">← Practice</Button></Link>
      <h1 className="mt-3 text-xl font-bold text-slate-900">✍️ Writing</h1>
      <p className="mt-1 text-sm text-slate-500">Get a prompt, write your answer, and have it graded with specific fixes.</p>

      <div className="mt-4 space-y-3">
        <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} />
        <SectionPicker index={sections} value={sel} onChange={setSel} />
        <Button onClick={generate} disabled={generating}>{generating ? "Generating…" : "New writing prompt →"}</Button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {prompts.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Past prompts</h2>
          {prompts.map((p) => (
            <Card key={p.id} className="flex items-center justify-between p-3">
              <button className="flex-1 text-left" onClick={() => setActiveId(p.id)}>
                <span className="font-medium text-slate-800">{p.topic ?? "Writing prompt"}</span>
                <span className="ml-2"><Pill tone="indigo">{levelLabel(p.level).split(" ")[0]}</Pill></span>
                <p className="mt-0.5 text-xs text-slate-400">{p.attempts.length} attempt{p.attempts.length === 1 ? "" : "s"}</p>
              </button>
              <button onClick={() => remove(p.id)} className="ml-2 text-xs text-slate-400 hover:text-rose-600">Delete</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptWorkspace({ prompt, onSaved }: { prompt: WritingPromptRow; onSaved: (id: string, a: WritingAttempt) => void }) {
  const [body, setBody] = useState("");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const latest = prompt.attempts[prompt.attempts.length - 1];

  async function grade() {
    if (!body.trim() || grading) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch("/api/practice/writing/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, prompt: prompt.prompt, body, level: prompt.level, tense: prompt.tense }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to grade");
      onSaved(prompt.id, d.attempt);
      setBody("");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="mt-3 space-y-4">
      <Card className="p-4">
        <div className="mb-1 flex gap-1.5">
          <Pill tone="indigo">{levelLabel(prompt.level)}</Pill>
          <Pill>{tenseLabel(prompt.tense)}</Pill>
        </div>
        <p className="text-lg font-semibold text-slate-900">{prompt.prompt}</p>
        <p className="mt-1 text-sm text-slate-400">{prompt.promptEn}</p>
        {prompt.words.length > 0 && <p className="mt-2 text-xs text-slate-400">Try to use: {prompt.words.join(", ")}</p>}
      </Card>

      <div>
        <div className="mb-1 flex flex-wrap gap-1">
          {ACCENTS.map((a) => (
            <button key={a} type="button" onMouseDown={(e) => { e.preventDefault(); setBody((b) => b + a); }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm hover:bg-slate-100">{a}</button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Escribe tu respuesta aquí…"
          className="w-full resize-y rounded-xl border-2 border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={grade} disabled={grading || !body.trim()}>{grading ? "Grading…" : "Grade it"}</Button>
          <span className="text-xs text-slate-400">Grading saves the attempt; you can retry the same prompt.</span>
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>

      {latest && <GradeView attempt={latest} />}

      {prompt.attempts.length > 1 && (
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer">Earlier attempts ({prompt.attempts.length - 1})</summary>
          <div className="mt-2 space-y-3">
            {prompt.attempts.slice(0, -1).reverse().map((a) => <GradeView key={a.id} attempt={a} compact />)}
          </div>
        </details>
      )}
    </div>
  );
}

function GradeView({ attempt, compact }: { attempt: WritingAttempt; compact?: boolean }) {
  const g = attempt.grade;
  const tone = g.score >= 80 ? "green" : g.score >= 60 ? "amber" : "slate";
  return (
    <Card className={cx("p-4", compact && "bg-slate-50")}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-800">Score</span>
        <Pill tone={tone}>{g.score}/100</Pill>
      </div>
      <p className="mt-1 text-sm text-slate-600">{g.summary}</p>
      {!compact && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Your submission</summary>
          <p className="mt-1 whitespace-pre-wrap">{attempt.body}</p>
        </details>
      )}
      {g.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Strengths</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{g.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {g.fixes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Fixes</p>
          <ul className="mt-1 space-y-2 text-sm">
            {g.fixes.map((f, i) => (
              <li key={i} className="rounded-lg bg-amber-50 px-3 py-2">
                <span className="text-rose-700 line-through">{f.wrong}</span>{" → "}
                <span className="font-semibold text-emerald-700">{f.better}</span>
                <p className="mt-0.5 text-xs text-slate-500">{f.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
