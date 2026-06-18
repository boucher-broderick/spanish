// Section picker index + random word selection for the LLM games. A learner can
// target a unit + section; we pull 10–20 random words from that section's vocab
// (verbs/nouns/adjectives/adverbs/expressions) to weave into a story or surface
// in a word bank. "any" samples across all units. Server-only (reads vocab.json
// via lib/book.ts).
import "server-only";
import { allVocab } from "./book";
import { selectWords } from "./word-select";

export interface SectionRef {
  unit: number;
  section: number; // index within the unit's sections
  title: string;
}
export interface UnitIndex {
  unit: number;
  title: string;
  sections: SectionRef[];
}

/** Units + their sections, for the picker UI. Cheap (titles only). */
export function sectionsIndex(): UnitIndex[] {
  return allVocab().map((u) => ({
    unit: u.unit,
    title: u.title,
    sections: u.sections.map((s, i) => ({ unit: u.unit, section: i, title: s.title })),
  }));
}

/** Random 10–20 Spanish words from a section (or across all units when
 *  unit is null / "any"). Returns fewer only if the pool is smaller. */
export function pickWords(unit: number | null, section: number | null, min = 10, max = 20): string[] {
  return selectWords(allVocab(), unit, section, min, max);
}

/** Resolve a section's display title, for labelling generated content. */
export function sectionTitle(unit: number | null, section: number | null): string | null {
  if (unit == null) return null;
  const u = allVocab().find((x) => x.unit === unit);
  if (!u) return null;
  if (section == null) return u.title;
  return u.sections[section]?.title ?? u.title;
}
