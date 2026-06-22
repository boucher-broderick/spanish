// Vocab read path. Postgres is the source of truth (tables seeded by
// parser/seed_vocab_db.mjs); when the DB is unreachable or the content tables
// don't exist yet, we fall back to the committed data/vocab.json so the app
// still renders with zero setup. Result is memoized for the process lifetime
// (vocab is static content). Server-only.
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./store";
import type { VocabUnit, VocabWord, VocabPos } from "./book";

function emptySections(): Record<VocabPos, VocabWord[]> {
  return { verbs: [], nouns: [], adjectives: [], adverbs: [], expressions: [] };
}

/** Assemble the VocabUnit[] shape (units -> sections -> per-POS word arrays) from Postgres. */
async function fromDb(): Promise<VocabUnit[]> {
  const pool = await getPool();
  const [units, sections, words] = await Promise.all([
    pool.query<{ unit: number; title: string }>(
      "SELECT unit, title FROM vocab_units ORDER BY unit"
    ),
    pool.query<{ unit: number; section_idx: number; title: string; page: number | null }>(
      "SELECT unit, section_idx, title, page FROM vocab_sections ORDER BY unit, section_idx"
    ),
    pool.query<{ unit: number; section_idx: number; pos: VocabPos; es: string; en: string; gender: string | null; yo: string | null }>(
      `SELECT sw.unit, sw.section_idx, sw.pos, v.es, v.en, v.gender, v.yo
         FROM vocab_section_words sw JOIN vocab v ON v.id_word = sw.word_id
        ORDER BY sw.unit, sw.section_idx, sw.ord`
    ),
  ]);
  if (!units.rowCount) throw new Error("vocab tables empty");

  const key = (u: number, s: number) => `${u}:${s}`;
  const secMap = new Map<string, VocabUnit["sections"][number]>();
  const unitMap = new Map<number, VocabUnit>();

  for (const u of units.rows) {
    unitMap.set(u.unit, { unit: u.unit, title: u.title, sections: [] });
  }
  for (const s of sections.rows) {
    const sec = { title: s.title, page: s.page ?? 0, ...emptySections() };
    unitMap.get(s.unit)?.sections.push(sec);
    secMap.set(key(s.unit, s.section_idx), sec);
  }
  for (const w of words.rows) {
    const sec = secMap.get(key(w.unit, w.section_idx));
    if (!sec) continue;
    const word: VocabWord = { es: w.es, en: w.en };
    if (w.gender) word.gender = w.gender;
    if (w.yo) word.yo = w.yo;
    sec[w.pos].push(word);
  }
  return [...unitMap.values()];
}

/** Fallback: the committed data/vocab.json (legacy full shape == VocabUnit[]). */
function fromJson(): VocabUnit[] {
  const raw = readFileSync(join(process.cwd(), "data", "vocab.json"), "utf8");
  return (JSON.parse(raw) as { units: VocabUnit[] }).units;
}

let _cache: Promise<VocabUnit[]> | null = null;

export function loadVocab(): Promise<VocabUnit[]> {
  if (!_cache) {
    _cache = (async () => {
      try {
        return await fromDb();
      } catch (e) {
        console.warn("[vocab-db] DB unavailable, falling back to data/vocab.json:", (e as Error).message);
        return fromJson();
      }
    })();
  }
  return _cache;
}
