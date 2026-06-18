// Pure word-selection logic, framework- and side-effect-free (no server-only),
// so it's unit-testable in plain Node. lib/practice-words.ts wires this to the
// vocab dataset; routes call that. Kept separate purely for testability.
import type { VocabPos, VocabUnit, VocabWord } from "./book";

const POS: VocabPos[] = ["verbs", "nouns", "adjectives", "adverbs", "expressions"];

function wordsInSection(words: VocabWord[] | undefined): string[] {
  return (words ?? []).map((w) => w.es).filter(Boolean);
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Collect the Spanish word forms in scope. unit/section null => widen scope. */
export function poolFor(units: VocabUnit[], unit: number | null, section: number | null): string[] {
  const pool: string[] = [];
  for (const u of units) {
    if (unit != null && u.unit !== unit) continue;
    u.sections.forEach((s, i) => {
      if (unit != null && section != null && i !== section) return;
      for (const pos of POS) pool.push(...wordsInSection(s[pos]));
    });
  }
  return Array.from(new Set(pool));
}

/** Random 10–20 (clamped to pool size) unique words from the chosen scope. */
export function selectWords(
  units: VocabUnit[],
  unit: number | null,
  section: number | null,
  min = 10,
  max = 20,
  rand: () => number = Math.random
): string[] {
  const unique = poolFor(units, unit, section);
  const target = Math.min(max, Math.max(min, Math.floor(rand() * (max - min + 1)) + min));
  return shuffle(unique, rand).slice(0, Math.min(target, unique.length));
}
