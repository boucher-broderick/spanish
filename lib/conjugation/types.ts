// Conjugation domain types.

export type Tense =
  | "present"
  | "preterite"
  | "imperfect"
  | "future"
  | "conditional"
  | "presentSubjunctive"
  | "imperfectSubjunctive";

export const TENSES: { id: Tense; label: string; short: string }[] = [
  { id: "present", label: "Present", short: "Pres." },
  { id: "preterite", label: "Preterite", short: "Pret." },
  { id: "imperfect", label: "Imperfect", short: "Imp." },
  { id: "future", label: "Future", short: "Fut." },
  { id: "conditional", label: "Conditional", short: "Cond." },
  { id: "presentSubjunctive", label: "Present subjunctive", short: "Subj." },
  { id: "imperfectSubjunctive", label: "Imperfect subjunctive", short: "Imp. subj." },
];

// Six grammatical persons, indexed 0-5. The UI shows five (vosotros hidden by default).
export const PERSONS = [
  { key: "yo", label: "yo" },
  { key: "tu", label: "tú" },
  { key: "el", label: "él/ella/usted" },
  { key: "nosotros", label: "nosotros" },
  { key: "vosotros", label: "vosotros" },
  { key: "ellos", label: "ellos/ellas/ustedes" },
] as const;

// Person indices shown in the Conjugation exercise (no vosotros).
export const SHOWN_PERSON_INDICES = [0, 1, 2, 3, 5];

export type Conjugation = Record<Tense, string[]>; // each tense -> 6 forms

// Per-verb override configuration consumed by the engine.
export interface VerbConfig {
  // Boot stem change for the present tense (and propagated to subjunctive/preterite for -ir).
  stemChange?: "e:ie" | "o:ue" | "e:i" | "u:ue" | "i:ie" | "u:ú" | "i:í";
  presentYo?: string; // irregular yo form, e.g. "tengo", "conozco"
  preteriteStem?: string; // strong preterite stem, e.g. "tuv" -> tuve, tuviste...
  futureStem?: string; // irregular future/conditional stem, e.g. "tendr"
  // Full per-tense overrides (each a 6-array). Highest priority.
  overrides?: Partial<Record<Tense, string[]>>;
  // Mark a fully-handled irregular so the auditor knows it was intentional.
  fullyIrregular?: boolean;
}
