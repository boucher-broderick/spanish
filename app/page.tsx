"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EXERCISES, ExerciseId, Word } from "@/lib/domain";
import { shuffle } from "@/lib/progress";
import { courseReviewPool, engagedCourseWords } from "@/lib/lesson-progress";
import { useProgress } from "@/components/useProgress";
import { WordsGate } from "@/components/WordsGate";
import { Play } from "@/components/Play";
import { Settings } from "@/components/Settings";
import { NumbersGame } from "@/components/games/NumbersGame";
import { TimeGame } from "@/components/games/TimeGame";
import { CalendarGame } from "@/components/games/CalendarGame";
import { Writing } from "@/components/composition/Writing";
import { Reading } from "@/components/composition/Reading";
import { Listening } from "@/components/composition/Listening";
import { StoriesTable } from "@/components/composition/StoriesTable";
import { CourseHome } from "@/components/course/CourseHome";
import { LessonView } from "@/components/course/LessonView";
import { DailyReview } from "@/components/course/DailyReview";
import { StoryRow } from "@/lib/composition";
import { Button, Card } from "@/components/ui";

type GameId = "numbers" | "time" | "calendar";
type Screen = "home" | "other" | "play" | "game" | "writing" | "reading" | "listening" | "stories" | "course" | "lesson" | "daily";
type ReviewExercise = "spelling" | "conjugation";

const PRACTICE_META: { id: "writing" | "reading" | "listening" | "stories"; label: string; emoji: string; blurb: string }[] = [
  { id: "writing", label: "Writing", emoji: "✍️", blurb: "Get a prompt, write, get it graded & fixed." },
  { id: "reading", label: "Reading", emoji: "📖", blurb: "Generated stories + open-ended quizzes." },
  { id: "listening", label: "Listening", emoji: "🎧", blurb: "Hear a story; quiz or transcribe it." },
  { id: "stories", label: "Stories", emoji: "📚", blurb: "All your saved stories in one table." },
];

const exLabel = (id: ExerciseId) => EXERCISES.find((e) => e.id === id)?.label ?? id;

const GAME_META: { id: GameId; label: string; emoji: string; blurb: string }[] = [
  { id: "numbers", label: "Numbers", emoji: "🔢", blurb: "Spell numbers in Spanish." },
  { id: "time", label: "Time", emoji: "🕐", blurb: "Tell the time in Spanish." },
  { id: "calendar", label: "Calendar", emoji: "📅", blurb: "Say the date in Spanish." },
];

export default function Page() {
  return (
    <WordsGate>
      <Home />
    </WordsGate>
  );
}

function Home() {
  const router = useRouter();
  const api = useProgress();
  const { state } = api;

  const [screen, setScreen] = useState<Screen>("home");
  const [reviewExercise, setReviewExercise] = useState<ReviewExercise>("spelling");
  const [game, setGame] = useState<GameId>("numbers");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openStory, setOpenStory] = useState<StoryRow | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);

  // Spanish words from lessons the user has engaged — the word-bank woven into
  // other-practice writing/reading for extra exposure.
  const engagedWords = useMemo(() => engagedCourseWords(state).map((w) => w.spanish), [state]);

  // Other-practice review round: the course words met so far, in the chosen exercise.
  const buildReviewRound = useCallback((): Word[] => {
    const seed = Math.floor(Math.random() * 1e9);
    return shuffle(courseReviewPool(state, reviewExercise), seed);
  }, [state, reviewExercise]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  // ---- COURSE-WORD REVIEW (other practice) ----
  if (screen === "play") {
    return (
      <Play
        key={reviewExercise}
        mode="learn"
        exercise={reviewExercise}
        settings={state.settings}
        tracking
        state={state}
        buildRound={buildReviewRound}
        record={api.record}
        demote={api.demote}
        onExit={() => setScreen("other")}
        title={`${exLabel(reviewExercise)} · course review`}
      />
    );
  }

  // ---- GAMES ----
  if (screen === "game") {
    const onExit = () => setScreen("other");
    if (game === "numbers")
      return <NumbersGame settings={state.settings} updateSettings={api.updateSettings} onExit={onExit} />;
    if (game === "time")
      return <TimeGame settings={state.settings} updateSettings={api.updateSettings} onExit={onExit} />;
    return <CalendarGame onExit={onExit} />;
  }

  // ---- PRACTICE (writing / reading / listening / stories) ----
  // Returning from a composition screen goes back to Other practice. Writing/Reading
  // get the engaged course words as a soft word-bank for extra exposure.
  const exitToOther = () => {
    setOpenStory(null);
    setScreen("other");
  };
  if (screen === "writing") return <Writing onExit={exitToOther} includeWords={engagedWords} />;
  if (screen === "reading")
    return (
      <Reading
        key={openStory?.id ?? "new"}
        onExit={exitToOther}
        initialStory={openStory}
        includeWords={engagedWords}
      />
    );
  if (screen === "listening")
    return <Listening key={openStory?.id ?? "pick"} onExit={exitToOther} initialStory={openStory} />;
  if (screen === "stories")
    return (
      <StoriesTable
        onExit={exitToOther}
        onOpen={(story, section) => {
          setOpenStory(story);
          setScreen(section);
        }}
      />
    );

  // ---- COURSE ----
  if (screen === "course")
    return (
      <CourseHome
        api={api}
        onExit={() => setScreen("home")}
        onOpenLesson={(id) => {
          setLessonId(id);
          setScreen("lesson");
        }}
        onOpenDaily={() => setScreen("daily")}
      />
    );
  if (screen === "lesson" && lessonId)
    return <LessonView lessonId={lessonId} api={api} onExit={() => setScreen("course")} />;
  if (screen === "daily") return <DailyReview api={api} onExit={() => setScreen("course")} />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Español</h1>
        <div className="flex items-center gap-2">
          {api.saving && <span className="text-xs text-slate-400">saving…</span>}
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            ⚙︎
          </Button>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>

      {screen === "other" && (
        <button
          onClick={() => setScreen("home")}
          className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Back
        </button>
      )}

      {screen === "home" && (
        <div className="space-y-3">
          <button onClick={() => setScreen("course")} className="w-full">
            <Card className="flex items-center gap-4 p-5 text-left hover:border-indigo-300">
              <span className="text-4xl">📚</span>
              <span className="flex-1">
                <span className="block text-lg font-semibold text-slate-900">Course</span>
                <span className="block text-sm text-slate-500">
                  Guided A1→A2 lessons with an AI teacher, practice & daily review.
                </span>
              </span>
            </Card>
          </button>
          <button onClick={() => setScreen("other")} className="w-full">
            <Card className="flex items-center gap-4 p-5 text-left hover:border-indigo-300">
              <span className="text-4xl">🎯</span>
              <span className="flex-1">
                <span className="block text-lg font-semibold text-slate-900">Other practice</span>
                <span className="block text-sm text-slate-500">
                  Review your course words, play games, and free writing/reading/listening.
                </span>
              </span>
            </Card>
          </button>
        </div>
      )}

      {screen === "other" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Review your words</h2>
            <p className="mb-2 text-sm text-slate-500">
              {engagedWords.length > 0
                ? "Stay in touch with the words you've met in the course."
                : "Start a lesson in the Course to unlock word review here."}
            </p>
            <div className="grid grid-cols-1 gap-3">
              {([
                { ex: "spelling" as ReviewExercise, emoji: "✍️", label: "Spelling review", blurb: "Type your learned nouns, adjectives & more." },
                { ex: "conjugation" as ReviewExercise, emoji: "🔤", label: "Conjugation review", blurb: "Conjugate the verbs you've learned." },
              ]).map((r) => {
                const n = courseReviewPool(state, r.ex).length;
                return (
                  <button
                    key={r.ex}
                    disabled={n === 0}
                    onClick={() => {
                      setReviewExercise(r.ex);
                      setScreen("play");
                    }}
                    className="w-full disabled:opacity-50"
                  >
                    <Card className="flex items-center gap-4 p-4 text-left hover:border-indigo-300">
                      <span className="text-3xl">{r.emoji}</span>
                      <span className="flex-1">
                        <span className="block font-semibold text-slate-900">{r.label}</span>
                        <span className="block text-sm text-slate-500">
                          {n > 0 ? `${n} words · ${r.blurb}` : "No words yet"}
                        </span>
                      </span>
                    </Card>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Games</h2>
            <div className="grid grid-cols-1 gap-3">
              {GAME_META.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setGame(g.id);
                    setScreen("game");
                  }}
                  className="w-full"
                >
                  <Card className="flex items-center gap-4 p-4 text-left hover:border-indigo-300">
                    <span className="text-3xl">{g.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold text-slate-900">{g.label}</span>
                      <span className="block text-sm text-slate-500">{g.blurb}</span>
                    </span>
                  </Card>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Practice</h2>
            <div className="grid grid-cols-1 gap-3">
              {PRACTICE_META.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setOpenStory(null);
                    setScreen(p.id);
                  }}
                  className="w-full"
                >
                  <Card className="flex items-center gap-4 p-4 text-left hover:border-indigo-300">
                    <span className="text-3xl">{p.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold text-slate-900">{p.label}</span>
                      <span className="block text-sm text-slate-500">{p.blurb}</span>
                    </span>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <Settings
          state={state}
          onClose={() => setSettingsOpen(false)}
          updateSettings={api.updateSettings}
          doResetExercise={api.doResetExercise}
          doResetWord={api.doResetWord}
        />
      )}
    </div>
  );
}
