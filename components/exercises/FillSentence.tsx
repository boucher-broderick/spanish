"use client";
import { useEffect, useRef, useState } from "react";
import { Word } from "@/lib/domain";
import { matchesLoose } from "@/lib/text";
import { Sentence } from "@/lib/words";
import { AnswerFooter, AnswerInput, Phase, PromptHeader } from "./shared";

// Fill in the Sentence: a Spanish sentence with a blank; supply the missing word
// from context. English meaning shown as a hint. Accent-tolerant.
export function FillSentence({
  word,
  sentence,
  onResult,
}: {
  word: Word;
  sentence: Sentence;
  onResult: (correct: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const target = sentence.clozeAnswer;
  const correct = matchesLoose(value, target);
  const parts = sentence.spanishCloze.split(/_{2,}/);

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
      <PromptHeader eyebrow="Fill in the Sentence">
        Complete the sentence — hint: <span className="font-semibold">“{word.english}”</span>
      </PromptHeader>
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-lg leading-relaxed text-slate-700">
        {parts[0]}
        <span className="mx-1 inline-block min-w-16 border-b-2 border-indigo-400 text-center font-semibold text-indigo-600">
          {phase === "feedback" ? target : "____"}
        </span>
        {parts[1] ?? ""}
      </p>
      <AnswerInput
        ref={inputRef}
        value={value}
        readOnly={phase === "feedback"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        placeholder="palabra…"
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
