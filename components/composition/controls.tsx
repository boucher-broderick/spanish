"use client";
import { ReactNode } from "react";
import {
  COMP_TENSES,
  CompTense,
  Level,
  LEVELS,
  StoryLengthId,
  STORY_LENGTHS,
} from "@/lib/composition";
import { cx } from "../ui";

export interface Criteria {
  level: Level;
  tense: CompTense;
  topic: string;
  length: StoryLengthId;
}
export const DEFAULT_CRITERIA: Criteria = { level: "B1", tense: "any", topic: "", length: "medium" };

// A labelled row of selectable chips.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
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
      <Segmented label="Level" options={LEVELS as unknown as { id: Level; label: string }[]} value={value.level} onChange={(level) => onChange({ level })} />
      <Segmented label="Tense" options={COMP_TENSES} value={value.tense} onChange={(tense) => onChange({ tense })} />
      {withLength && (
        <Segmented
          label="Length"
          options={STORY_LENGTHS as unknown as { id: StoryLengthId; label: string }[]}
          value={value.length}
          onChange={(length) => onChange({ length })}
        />
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

export function levelLabel(id: string): string {
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}
export function tenseLabel(id: string): string {
  return COMP_TENSES.find((t) => t.id === id)?.label ?? id;
}
export function lengthLabel(id: string): string {
  return STORY_LENGTHS.find((l) => l.id === id)?.label ?? id;
}
