"use client";
import { useEffect, useRef, useState } from "react";
import { StoryRow } from "@/lib/composition";
import { diffStats, diffWords } from "@/lib/diff";
import { Button, Card, Pill, cx } from "../ui";
import { levelLabel, lengthLabel, StoryBody, tenseLabel } from "./controls";
import { Quiz } from "./Quiz";

type Mode = "quiz" | "transcribe";

export function Listening({ onExit, initialStory }: { onExit: () => void; initialStory?: StoryRow | null }) {
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(!initialStory);
  const [story, setStory] = useState<StoryRow | null>(initialStory ?? null);

  useEffect(() => {
    if (initialStory) return;
    fetch("/api/stories")
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => setStories(d.stories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialStory]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button
        onClick={story && !initialStory ? () => setStory(null) : onExit}
        className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        ← Back
      </button>

      {story ? (
        <ListenWorkspace story={story} />
      ) : (
        <div className="space-y-3">
          <h1 className="text-xl font-bold text-slate-900">🎧 Listening</h1>
          <p className="text-sm text-slate-500">
            Pick a saved story to listen to. Answer a quiz, or transcribe what you hear. (New stories come from the Reading section.)
          </p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : stories.length === 0 ? (
            <p className="text-sm text-slate-400">No stories yet — generate one in Reading first.</p>
          ) : (
            <div className="space-y-2">
              {stories.map((s) => (
                <Card key={s.id} className="p-3">
                  <button className="block w-full text-left" onClick={() => setStory(s)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{s.title}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {s.hasAudio && <Pill tone="green">audio</Pill>}
                        <Pill tone="indigo">{levelLabel(s.level).split(" ")[0]}</Pill>
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{lengthLabel(s.length)}</p>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListenWorkspace({ story }: { story: StoryRow }) {
  const [mode, setMode] = useState<Mode>("quiz");
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="space-y-4">
      <header>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Pill tone="indigo">{levelLabel(story.level)}</Pill>
          <Pill>{tenseLabel(story.tense)}</Pill>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{story.title}</h1>
      </header>

      <AudioPlayer key={story.id} story={story} />

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(["quiz", "transcribe"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-lg px-3 py-1 text-sm font-medium capitalize",
                mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => setShowTranscript((s) => !s)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          {showTranscript ? "Hide transcript" : "Show transcript"}
        </button>
      </div>

      {showTranscript && (
        <Card className="p-4">
          <StoryBody body={story.body} />
        </Card>
      )}

      {mode === "quiz" ? (
        <Quiz storyId={story.id} quiz={story.quiz} level={story.level} />
      ) : (
        <Transcribe story={story} />
      )}
    </div>
  );
}

// Plays cached server audio (Gemini TTS, recorded once). Falls back to the
// browser's Web Speech API when the server has no TTS key (HTTP 501).
function AudioPlayer({ story }: { story: StoryRow }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "speech" | "error">("idle");
  const [error, setError] = useState("");

  // Component is keyed by story.id, so a new story remounts fresh state; we only
  // need to clean up the object URL and any in-flight speech on unmount.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
    window.speechSynthesis?.cancel();
  }, [url]);

  function speakViaBrowser() {
    const synth = window.speechSynthesis;
    if (!synth) {
      setError("No audio available and this browser has no speech support.");
      setStatus("error");
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(story.body);
    u.lang = "es-ES";
    const esVoice = synth.getVoices().find((v) => v.lang.startsWith("es"));
    if (esVoice) u.voice = esVoice;
    u.rate = 0.95;
    synth.speak(u);
    setStatus("speech");
  }

  async function load() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/stories/${story.id}/audio`);
      if (res.status === 501) {
        speakViaBrowser();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Audio failed (${res.status})`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setUrl(objUrl);
      setStatus("ready");
      // play after the <audio> picks up the new src
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    } catch (e) {
      setError(String((e as Error).message));
      setStatus("error");
    }
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-3">
        {url ? (
          <audio ref={audioRef} src={url} controls className="w-full" />
        ) : (
          <Button onClick={load} disabled={status === "loading"}>
            {status === "loading" ? "Generating audio…" : status === "speech" ? "▶ Replay" : "▶ Play narration"}
          </Button>
        )}
        {status === "loading" && <span className="text-xs text-slate-400">first time only — recording &amp; saving</span>}
        {status === "speech" && (
          <span className="text-xs text-slate-400">browser voice (no server TTS key)</span>
        )}
      </div>
      {status === "speech" && (
        <button onClick={() => window.speechSynthesis.cancel()} className="text-xs text-slate-500 hover:text-slate-700">
          ■ Stop
        </button>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </Card>
  );
}

function Transcribe({ story }: { story: StoryRow }) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);

  const segs = checked ? diffWords(story.body, text) : null;
  const stats = segs ? diffStats(segs) : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Listen and type what you hear. Then check it against the original.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setChecked(false);
        }}
        rows={8}
        placeholder="Escribe lo que escuchas…"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      <Button className="w-full" onClick={() => setChecked(true)} disabled={!text.trim()}>
        Check transcription
      </Button>

      {segs && stats && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Accuracy</span>
            <Pill tone={stats.accuracy >= 0.9 ? "green" : stats.accuracy >= 0.6 ? "amber" : "slate"}>
              {stats.correct}/{stats.total} · {Math.round(stats.accuracy * 100)}%
            </Pill>
          </div>
          <p className="text-sm leading-relaxed">
            {segs.map((s, i) => {
              if (s.op === "equal") return <span key={i} className="text-emerald-700">{s.ref} </span>;
              if (s.op === "sub")
                return (
                  <span key={i} className="text-rose-600" title={`you wrote: ${s.hyp}`}>
                    {s.ref} </span>
                );
              if (s.op === "del") return <span key={i} className="text-rose-600 underline">{s.ref} </span>;
              return (
                <span key={i} className="text-amber-600">
                  [+{s.hyp}] </span>
              );
            })}
          </p>
          <p className="text-xs text-slate-400">
            <span className="text-emerald-700">green</span> correct · <span className="text-rose-600">red</span> wrong/missed ·{" "}
            <span className="text-amber-600">amber</span> extra word
          </p>
        </Card>
      )}
    </div>
  );
}
