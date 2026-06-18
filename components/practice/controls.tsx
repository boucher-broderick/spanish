"use client";
import { ReactNode } from "react";
import {
  Criteria,
  LEVELS,
  Level,
  STORY_LENGTHS,
  StoryLengthId,
  TENSES,
  Tense,
} from "@/lib/composition";
import { cx } from "../ui";

// A labelled row of selectable chips.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cx(
              "rounded-lg px-2.5 py-1 text-sm font-medium transition-colors",
              value === o.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

// Level + tense + (optional length) + topic, driven by a Criteria value.
export function CriteriaControls({
  value,
  onChange,
  withLength,
}: {
  value: Criteria;
  onChange: (patch: Partial<Criteria>) => void;
  withLength?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <Segmented label="Level" options={LEVELS} value={value.level} onChange={(level: Level) => onChange({ level })} />
      <Segmented label="Tense" options={TENSES} value={value.tense} onChange={(tense: Tense) => onChange({ tense })} />
      {withLength && (
        <Segmented label="Length" options={STORY_LENGTHS} value={value.length} onChange={(length: StoryLengthId) => onChange({ length })} />
      )}
      <Field label="Topic (optional — blank = surprise me)">
        <input
          value={value.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
          placeholder="e.g. a soccer match, cooking, time travel…"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </Field>
    </div>
  );
}

// Render a story body's paragraphs.
export function StoryBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 leading-relaxed text-slate-800">
      {body.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
    </div>
  );
}

// Spanish accent quick-insert row, shared by the writing/chat inputs.
export const ACCENTS = ["á", "é", "í", "ó", "ú", "ñ", "¿", "¡"];
