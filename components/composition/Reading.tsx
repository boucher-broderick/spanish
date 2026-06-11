"use client";
import { useState } from "react";
import { StoryRow } from "@/lib/composition";
import { Button, Pill } from "../ui";
import { Criteria, CriteriaControls, DEFAULT_CRITERIA, levelLabel, lengthLabel, StoryBody, tenseLabel } from "./controls";
import { Quiz } from "./Quiz";

// Reading: generate a story to read, then answer an open-ended quiz. Can also
// open an existing story (from the Stories table). New stories are persisted, so
// `onCreated` lets the parent refresh its list.
export function Reading({
  onExit,
  initialStory,
  onCreated,
}: {
  onExit: () => void;
  initialStory?: StoryRow | null;
  onCreated?: (story: StoryRow) => void;
}) {
  const [crit, setCrit] = useState<Criteria>(DEFAULT_CRITERIA);
  const [story, setStory] = useState<StoryRow | null>(initialStory ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: crit.level, tense: crit.tense, topic: crit.topic || undefined, length: crit.length }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to generate story");
      setStory(d.story);
      onCreated?.(d.story);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button
        onClick={story && !initialStory ? () => setStory(null) : onExit}
        className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        ← Back
      </button>

      {story ? (
        <article className="space-y-5">
          <header>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Pill tone="indigo">{levelLabel(story.level)}</Pill>
              <Pill>{tenseLabel(story.tense)}</Pill>
              <Pill>{lengthLabel(story.length)}</Pill>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{story.title}</h1>
          </header>
          <StoryBody body={story.body} />
          <hr className="border-slate-200" />
          <Quiz storyId={story.id} quiz={story.quiz} level={story.level} />
        </article>
      ) : (
        <div className="space-y-3">
          <h1 className="text-xl font-bold text-slate-900">📖 Reading</h1>
          <p className="text-sm text-slate-500">
            Generate a story at your level &amp; tense, then answer open-ended questions about it. Stories are saved for re-reading and listening.
          </p>
          <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} withLength />
          <Button className="w-full" onClick={generate} disabled={generating}>
            {generating ? "Writing your story…" : "Generate a story"}
          </Button>
          {generating && <p className="text-xs text-slate-400">Longer stories take a bit — hang tight.</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
