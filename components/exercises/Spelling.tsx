"use client";
import { useEffect, useRef, useState } from "react";
import { Word } from "@/lib/domain";
import { accentOnlyMiss, matchesStrict } from "@/lib/text";
import { AnswerFooter, AnswerInput, Phase, PromptHeader } from "./shared";

// Spelling: shown the English meaning, type the Spanish word. Accent-SENSITIVE.
export function Spelling({ word, onResult }: { word: Word; onResult: (correct: boolean) => void }) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const inputRef = useRef<HTMLInputElement>(null);

  // Parent remounts via key on each word, so state resets naturally — just focus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Nouns include their article (e.g. "el año"); everything else is the bare word.
  const withArticle = word.category === "Nouns" && !!word.article;
  const target = withArticle ? word.spanish : word.lemma;
  const correct = matchesStrict(value, target);

  function submit() {
    if (!value.trim()) return;
    setPhase("feedback");
  }
  function next() {
    onResult(correct);
  }
  function onEnter() {
    if (phase === "input") submit();
    else next();
  }

  return (
    <div className="space-y-4">
      <PromptHeader eyebrow={`Spelling · ${word.pos}`}>
        <span className="font-semibold">{word.english}</span>
        <span className="ml-2 text-sm text-slate-400">
          {withArticle ? "type it in Spanish (with el/la)" : "type it in Spanish"}
        </span>
      </PromptHeader>
      <AnswerInput
        ref={inputRef}
        value={value}
        readOnly={phase === "feedback"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        placeholder="español…"
      />
      <AnswerFooter
        phase={phase}
        correct={correct}
        submitDisabled={!value.trim()}
        reveal={!correct && <>Correct: <b className="text-slate-900">{target}</b></>}
        note={accentOnlyMiss(value, target) && "Accents count in Spelling — that was the only difference."}
        onSubmit={submit}
        onNext={next}
      />
    </div>
  );
}
