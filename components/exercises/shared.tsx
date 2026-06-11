"use client";
import { ReactNode } from "react";
import { Button } from "../ui";

export type Phase = "input" | "feedback";

// Footer shown after submitting: correctness banner + reveal + Next button.
export function AnswerFooter({
  phase,
  correct,
  reveal,
  note,
  onSubmit,
  onNext,
  submitDisabled,
  nextLabel = "Next",
}: {
  phase: Phase;
  correct: boolean;
  reveal?: ReactNode;
  note?: ReactNode;
  onSubmit: () => void;
  onNext: () => void;
  submitDisabled?: boolean;
  nextLabel?: string;
}) {
  if (phase === "input") {
    return (
      <Button onClick={onSubmit} disabled={submitDisabled} className="w-full">
        Check
      </Button>
    );
  }
  return (
    <div className="space-y-3">
      <div
        className={
          "rounded-xl px-4 py-3 text-sm font-medium " +
          (correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")
        }
      >
        <div>{correct ? "✓ Correct" : "✗ Not quite"}</div>
        {reveal && <div className="mt-1 font-normal text-slate-700">{reveal}</div>}
        {note && <div className="mt-1 text-xs font-normal text-slate-500">{note}</div>}
      </div>
      <Button onClick={onNext} variant={correct ? "success" : "primary"} className="w-full">
        {nextLabel}
      </Button>
    </div>
  );
}

export function PromptHeader({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{eyebrow}</div>
      <div className="mt-1 text-lg text-slate-800">{children}</div>
    </div>
  );
}

// A large text input tuned for Spanish answers (no autocorrect/autocapitalize).
export function AnswerInput({
  className,
  ref,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      type="text"
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      className={
        "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 " +
        (className ?? "")
      }
    />
  );
}
