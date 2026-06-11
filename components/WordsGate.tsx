"use client";
import { useEffect, useState } from "react";
import { Word } from "@/lib/domain";
import { initWords, wordsLoaded } from "@/lib/words";

// Fetches the word dataset from /api/words once and installs it into the runtime
// store before rendering children, so all the synchronous word helpers work.
export function WordsGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(() => wordsLoaded());

  useEffect(() => {
    if (wordsLoaded()) return;
    let alive = true;
    fetch("/api/words")
      .then((r) => (r.ok ? r.json() : []))
      .then((words: Word[]) => {
        if (!alive) return;
        initWords(words);
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading words…</div>;
  }
  return <>{children}</>;
}
