"use client";
import { useEffect, useState } from "react";
import { StoryRow } from "@/lib/composition";
import { getLesson } from "@/lib/curriculum";
import { Button, Card, Pill } from "../ui";
import { Criteria, CriteriaControls, DEFAULT_CRITERIA, levelLabel, lengthLabel, StoryBody, tenseLabel } from "./controls";
import { Quiz } from "./Quiz";
import { Definable } from "./Definable";

function lessonLabel(lessonId?: string | null): string | null {
  if (!lessonId) return null;
  return getLesson(lessonId)?.title ?? null;
}

// Reading: generate a story to read, then answer an open-ended quiz. Shows the
// previously generated stories so you can reopen them. In a lesson, stories are
// tagged with the lesson and the list is filtered to it; the lesson's words are
// woven into new stories for extra exposure.
export function Reading({
  onExit,
  initialStory,
  onCreated,
  onPassed,
  initialCriteria,
  includeWords,
  lessonId,
}: {
  onExit: () => void;
  initialStory?: StoryRow | null;
  onCreated?: (story: StoryRow) => void;
  onPassed?: () => void;
  initialCriteria?: Partial<Criteria>;
  includeWords?: string[];
  lessonId?: string;
}) {
  const [crit, setCrit] = useState<Criteria>({ ...DEFAULT_CRITERIA, ...initialCriteria });
  const [story, setStory] = useState<StoryRow | null>(initialStory ?? null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Load previous stories (filtered to this lesson when in a lesson).
  useEffect(() => {
    let alive = true;
    fetch("/api/stories")
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => {
        if (!alive) return;
        const all = (d.stories ?? []) as StoryRow[];
        setStories(lessonId ? all.filter((s) => s.lessonId === lessonId) : all);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lessonId]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          level: crit.level,
          tense: crit.tense,
          topic: crit.topic || undefined,
          length: crit.length,
          words: includeWords,
          lessonId,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to generate story");
      setStory(d.story);
      setStories((ss) => [d.story, ...ss]);
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
              {lessonLabel(story.lessonId) && <Pill tone="green">{lessonLabel(story.lessonId)}</Pill>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{story.title}</h1>
          </header>
          <DefinableStoryBody body={story.body} />
          <hr className="border-slate-200" />
          <Quiz storyId={story.id} quiz={story.quiz} level={story.level} onPassed={onPassed} />
        </article>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <h1 className="text-xl font-bold text-slate-900">📖 Reading</h1>
            <p className="text-sm text-slate-500">
              Generate a story at your level &amp; tense, then answer open-ended questions. Double-click any word to see its meaning.
            </p>
            <CriteriaControls value={crit} onChange={(patch) => setCrit((c) => ({ ...c, ...patch }))} withLength />
            <Button className="w-full" onClick={generate} disabled={generating}>
              {generating ? "Writing your story…" : "Generate a story"}
            </Button>
            {generating && <p className="text-xs text-slate-400">Longer stories take a bit — hang tight.</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          {stories.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Previous stories</h2>
              <div className="space-y-2">
                {stories.map((s) => (
                  <Card key={s.id} className="p-3">
                    <button className="block w-full text-left" onClick={() => setStory(s)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{s.title}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {lessonLabel(s.lessonId) && <Pill tone="green">{lessonLabel(s.lessonId)}</Pill>}
                          <Pill tone="indigo">{levelLabel(s.level).split(" ")[0]}</Pill>
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{lengthLabel(s.length)}</p>
                    </button>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// StoryBody whose words are double-click/select-to-define.
function DefinableStoryBody({ body }: { body: string }) {
  return (
    <Definable>
      <StoryBody body={body} />
    </Definable>
  );
}
