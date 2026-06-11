"use client";
import { useEffect, useRef, useState } from "react";
import { Word } from "@/lib/domain";
import { matchesLoose } from "@/lib/text";
import { Sentence } from "@/lib/words";
import { AnswerFooter, AnswerInput, Phase, PromptHeader } from "./shared";

// Fill in the Word: English word + English sentence -> type the full Spanish word
// (with el/la for nouns; infinitive for verbs). Accent-tolerant.
export function FillWord({
  word,
  sentence,
  onResult,
}: {
  word: Word;
  sentence?: Sentence;
  onResult: (correct: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const target = word.spanish; // includes article for nouns, infinitive for verbs
  const correct = matchesLoose(value, target);
  const hint = word.pos === "noun" ? "include el/la" : word.pos === "verb" ? "infinitive form" : "";

  function submit() {
    if (!value.trim()) return;
    setPhase("feedback");
  }
  function onEnter() {
    if (phase === "input") submit();
    else onResult(correct);
  }

  return (
    <div className="space-y-4">
      <PromptHeader eyebrow="Fill in the Word">
        <span className="font-semibold">{word.english}</span>
        {hint && <span className="ml-2 text-sm text-slate-400">({hint})</span>}
      </PromptHeader>
      {sentence?.englishSentence && (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-slate-600 italic">“{sentence.englishSentence}”</p>
      )}
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
        onSubmit={submit}
        onNext={() => onResult(correct)}
      />
    </div>
  );
}
