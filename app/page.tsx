"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EXERCISES, ExerciseId, Group, GROUP_GAMES, Word, groupForCategory } from "@/lib/domain";
import { groupCount, wordsByGroup, WORDS } from "@/lib/words";
import { reviewPool, selectLearnRound, shuffle } from "@/lib/progress";
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
type Screen = "home" | "group" | "play" | "game" | "writing" | "reading" | "listening" | "stories" | "course" | "lesson" | "daily";
type Mode = "learn" | "review";

const PRACTICE_META: { id: Exclude<Screen, "home" | "group" | "play" | "game">; label: string; emoji: string; blurb: string }[] = [
  { id: "writing", label: "Writing", emoji: "✍️", blurb: "Get a prompt, write, get it graded & fixed." },
  { id: "reading", label: "Reading", emoji: "📖", blurb: "Generated stories + open-ended quizzes." },
  { id: "listening", label: "Listening", emoji: "🎧", blurb: "Hear a story; quiz or transcribe it." },
  { id: "stories", label: "Stories", emoji: "📚", blurb: "All your saved stories in one table." },
];

const exLabel = (id: ExerciseId) => EXERCISES.find((e) => e.id === id)?.label ?? id;

const GROUP_META: { id: Group; emoji: string }[] = [
  { id: "Nouns", emoji: "📦" },
  { id: "Verbs", emoji: "🏃" },
  { id: "Other", emoji: "✨" },
];
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
  const [group, setGroup] = useState<Group>("Nouns");
  const [exercise, setExercise] = useState<ExerciseId>("spelling");
  const [mode, setMode] = useState<Mode>("learn");
  const [game, setGame] = useState<GameId>("numbers");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openStory, setOpenStory] = useState<StoryRow | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);

  // # of words in review, per group.
  const reviewByGroup = useMemo(() => {
    const m: Record<Group, number> = { Nouns: 0, Verbs: 0, Other: 0 };
    for (const w of WORDS) if (state.words[w.id]?.review) m[groupForCategory(w.category)]++;
    return m;
  }, [state.words]);

  const buildRound = useCallback((): Word[] => {
    const seed = Math.floor(Math.random() * 1e9);
    const pool = wordsByGroup(group);
    if (mode === "review") return shuffle(reviewPool(state, pool), seed);
    return shuffle(selectLearnRound(state, pool, exercise), seed);
  }, [group, exercise, mode, state]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function startWord(g: Group, ex: ExerciseId, m: Mode) {
    setGroup(g);
    setExercise(ex);
    setMode(m);
    setScreen("play");
  }

  // ---- WORD PLAY ----
  if (screen === "play") {
    return (
      <Play
        key={`${group}-${exercise}-${mode}`}
        mode={mode}
        exercise={exercise}
        settings={state.settings}
        tracking={mode === "learn"}
        state={state}
        buildRound={buildRound}
        record={api.record}
        demote={api.demote}
        onExit={() => setScreen("group")}
        title={`${exLabel(exercise)} · ${mode} · ${group}`}
      />
    );
  }

  // ---- GAMES ----
  if (screen === "game") {
    const onExit = () => setScreen("home");
    if (game === "numbers")
      return <NumbersGame settings={state.settings} updateSettings={api.updateSettings} onExit={onExit} />;
    if (game === "time")
      return <TimeGame settings={state.settings} updateSettings={api.updateSettings} onExit={onExit} />;
    return <CalendarGame onExit={onExit} />;
  }

  // ---- PRACTICE (writing / reading / listening / stories) ----
  const exitToHome = () => {
    setOpenStory(null);
    setScreen("home");
  };
  if (screen === "writing") return <Writing onExit={exitToHome} />;
  if (screen === "reading")
    return <Reading key={openStory?.id ?? "new"} onExit={exitToHome} initialStory={openStory} />;
  if (screen === "listening")
    return <Listening key={openStory?.id ?? "pick"} onExit={exitToHome} initialStory={openStory} />;
  if (screen === "stories")
    return (
      <StoriesTable
        onExit={exitToHome}
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

      {screen === "group" && (
        <button
          onClick={() => setScreen("home")}
          className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Back
        </button>
      )}

      {screen === "home" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Learn</h2>
            <button onClick={() => setScreen("course")} className="w-full">
              <Card className="flex items-center gap-4 p-4 text-left hover:border-indigo-300">
                <span className="text-3xl">📚</span>
                <span className="flex-1">
                  <span className="block font-semibold text-slate-900">Course</span>
                  <span className="block text-sm text-slate-500">
                    Guided A1→A2 lessons with an AI teacher, practice & daily review.
                  </span>
                </span>
              </Card>
            </button>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Word practice</h2>
            <div className="grid grid-cols-1 gap-3">
              {GROUP_META.map(({ id, emoji }) => (
                <button
                  key={id}
                  onClick={() => {
                    setGroup(id);
                    setScreen("group");
                  }}
                  className="w-full"
                >
                  <Card className="flex items-center gap-4 p-4 text-left hover:border-indigo-300">
                    <span className="text-3xl">{emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold text-slate-900">{id}</span>
                      <span className="block text-sm text-slate-500">
                        {groupCount(id)} words · {reviewByGroup[id]} in review
                      </span>
                    </span>
                  </Card>
                </button>
              ))}
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

      {screen === "group" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-800">{group}</h2>
          <p className="mb-3 text-sm text-slate-500">
            {reviewByGroup[group]} words in review · pick a game
          </p>
          <div className="space-y-2">
            {GROUP_GAMES[group].map((ex) => {
              const reviewN = reviewByGroup[group];
              return (
                <Card key={ex} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block font-semibold text-slate-900">{exLabel(ex)}</span>
                      {ex === "flashcards" && (
                        <span className="block text-sm text-slate-500">Just learn — no scoring.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => startWord(group, ex, "learn")}>Learn</Button>
                      <Button
                        variant="secondary"
                        disabled={reviewN === 0}
                        onClick={() => startWord(group, ex, "review")}
                      >
                        Review {reviewN > 0 ? `(${reviewN})` : ""}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
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
