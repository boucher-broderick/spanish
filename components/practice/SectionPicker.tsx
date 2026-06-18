"use client";
import type { UnitIndex } from "@/lib/practice-words";
import { Field } from "./controls";

export interface Selection {
  unit: number | null; // null = Any / no specific unit
  section: number | null; // null = whole unit (or all, when unit is null)
}

// Unit → section selector with an "Any / no specific unit" option. When a unit
// + section is chosen, the server pulls 10–20 random words from that section to
// weave into the generated content.
export function SectionPicker({
  index,
  value,
  onChange,
}: {
  index: UnitIndex[];
  value: Selection;
  onChange: (sel: Selection) => void;
}) {
  const unit = index.find((u) => u.unit === value.unit) ?? null;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <Field label="Unit (words come from here)">
        <select
          value={value.unit ?? ""}
          onChange={(e) => onChange({ unit: e.target.value === "" ? null : Number(e.target.value), section: null })}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">Any / no specific unit</option>
          {index.map((u) => (
            <option key={u.unit} value={u.unit}>
              {u.unit}. {u.title}
            </option>
          ))}
        </select>
      </Field>

      {unit && (
        <Field label="Section">
          <select
            value={value.section ?? ""}
            onChange={(e) => onChange({ unit: value.unit, section: e.target.value === "" ? null : Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Whole unit</option>
            {unit.sections.map((s) => (
              <option key={s.section} value={s.section}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
