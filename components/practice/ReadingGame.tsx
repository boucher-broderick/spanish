"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill } from "@/components/ui";
import { Criteria, DEFAULT_CRITERIA, StoryRow, levelLabel, lengthLabel } from "@/lib/composition";
import type { UnitIndex } from "@/lib/practice-words";
import { CriteriaControls, StoryBody } from "./controls";
import { SectionPicker, type Selection } from "./SectionPicker";
import { StoryQuiz } from "./StoryQuiz";

export function ReadingGame({ sections }: { sections: UnitIndex[] }) {
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

  async function remove(id: string) {
    setStories((s) => s.filter((x) => x.id !== id));
    if (story?.id === id) setStory(null);
    await fetch(`/api/composition?type=story&id=${id}`, { method: "DELETE" });
  }

  if (story) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <Button variant="ghost" onClick={() => setStory(null)}>← Back</Button>
        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">{story.title}</h1>
          <Pill tone="indigo">{levelLabel(story.level).split(" ")[0]}</Pill>
        </div>
        <Card className="mt-3 p-5"><StoryBody body={story.body} /></Card>
        <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Comprehension</h2>
        <StoryQuiz quiz={story.quiz} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <Link href="/practice"><Button variant="ghost">← Practice</Button></Link>
      <h1 className="mt-3 text-xl font-bold text-slate-900">📖 Reading</h1>
      <p className="mt-1 text-sm text-slate-500">Generate a story to read, then answer comprehension questions. Stories can also be played aloud in Listening.</p>

      <div className="mt-4 space-y-3">
        <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} withLength />
        <SectionPicker index={sections} value={sel} onChange={setSel} />
        <Button onClick={generate} disabled={generating}>{generating ? "Writing your story…" : "New story →"}</Button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {stories.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Past stories</h2>
          {stories.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-3">
              <button className="flex-1 text-left" onClick={() => setStory(s)}>
                <span className="font-semibold text-slate-800">{s.title}</span>
                <span className="ml-2"><Pill tone="indigo">{levelLabel(s.level).split(" ")[0]}</Pill></span>
                <p className="mt-0.5 text-xs text-slate-400">{lengthLabel(s.length)}</p>
              </button>
              <button onClick={() => remove(s.id)} className="ml-2 text-xs text-slate-400 hover:text-rose-600">Delete</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
