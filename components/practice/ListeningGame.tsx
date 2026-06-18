"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, cx } from "@/components/ui";
import { Criteria, DEFAULT_CRITERIA, StoryRow, levelLabel } from "@/lib/composition";
import { useTts } from "@/lib/useTts";
import type { UnitIndex } from "@/lib/practice-words";
import { CriteriaControls, StoryBody } from "./controls";
import { SectionPicker, type Selection } from "./SectionPicker";
import { StoryQuiz } from "./StoryQuiz";

export function ListeningGame({ sections }: { sections: UnitIndex[] }) {
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [story, setStory] = useState<StoryRow | null>(null);
  const [crit, setCrit] = useState<Criteria>(DEFAULT_CRITERIA);
  const [sel, setSel] = useState<Selection>({ unit: null, section: null });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/composition")
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => setStories(d.stories ?? []))
      .catch(() => {});
  }, []);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/practice/reading/story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: crit.level, tense: crit.tense, topic: crit.topic || undefined, length: crit.length, unit: sel.unit, section: sel.section }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to generate story");
      setStories((s) => [d.story, ...s]);
      setStory(d.story);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGenerating(false);
    }
  }

  if (story) return <ListenWorkspace story={story} onBack={() => setStory(null)} />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <Link href="/practice"><Button variant="ghost">← Practice</Button></Link>
      <h1 className="mt-3 text-xl font-bold text-slate-900">🎧 Listening</h1>
      <p className="mt-1 text-sm text-slate-500">Listen to a Spanish story read aloud, then transcribe it or answer questions. Pick a saved story or generate a new one.</p>

      <div className="mt-4 space-y-3">
        <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} withLength />
        <SectionPicker index={sections} value={sel} onChange={setSel} />
        <Button onClick={generate} disabled={generating}>{generating ? "Writing your story…" : "New story →"}</Button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {stories.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Saved stories</h2>
          {stories.map((s) => (
            <Card key={s.id} className="p-3">
              <button className="block w-full text-left" onClick={() => setStory(s)}>
                <span className="font-semibold text-slate-800">{s.title}</span>
                <span className="ml-2"><Pill tone="indigo">{levelLabel(s.level).split(" ")[0]}</Pill></span>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type Mode = "transcribe" | "quiz";

function ListenWorkspace({ story, onBack }: { story: StoryRow; onBack: () => void }) {
  const { supported, speaking, loading, speak, stop } = useTts();
  const [mode, setMode] = useState<Mode>("transcribe");
  const [rate, setRate] = useState(0.95);
  const [showText, setShowText] = useState(false);
  const [transcript, setTranscript] = useState("");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <Button variant="ghost" onClick={() => { stop(); onBack(); }}>← Back</Button>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">{story.title}</h1>
        <Pill tone="indigo">{levelLabel(story.level).split(" ")[0]}</Pill>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => speak(story.body, { rate })} disabled={!supported || loading}>
            {loading ? "Generating audio…" : speaking ? "🔊 Playing…" : "▶ Play"}
          </Button>
          <Button variant="secondary" onClick={stop} disabled={!supported || (!speaking && !loading)}>■ Stop</Button>
          <label className="ml-2 flex items-center gap-2 text-sm text-slate-500">
            Speed
            <input type="range" min={0.5} max={1.2} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
        </div>

        <div className="mt-3 flex gap-1.5">
          {(["transcribe", "quiz"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-lg px-3 py-1 text-sm font-medium capitalize transition-colors",
                mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>

      {mode === "transcribe" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-500">Listen and type what you hear. Then reveal the text to compare.</p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            placeholder="Escribe lo que oyes…"
            className="w-full resize-y rounded-xl border-2 border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <Button variant="secondary" onClick={() => setShowText((s) => !s)}>{showText ? "Hide text" : "Reveal text"}</Button>
          {showText && <Card className="p-5"><StoryBody body={story.body} /></Card>}
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-500">Answer from what you heard. Reveal the text any time.</p>
          <Button variant="secondary" onClick={() => setShowText((s) => !s)}>{showText ? "Hide text" : "Reveal text"}</Button>
          {showText && <Card className="mt-3 p-5"><StoryBody body={story.body} /></Card>}
          <div className="mt-4"><StoryQuiz quiz={story.quiz} /></div>
        </div>
      )}
    </div>
  );
}
