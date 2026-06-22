// Normalize data/vocab.json into a flat, de-duplicated word table + an ordered
// "curriculum" (the source of truth for the order cards are introduced in Anki).
//
// Input  : data/vocab.json  { units: [{ unit, title, sections: [{ title, page, verbs[], nouns[], ... }] }] }
//          each entry: { es, en, gender?, yo?, src? }   (src:"example" = harvested from an example sentence)
// Output : data/words.json   { words: [...], curriculum: [...] }
//
// Words are de-duplicated by (pos, lemma-slug); the same verb appearing in 40
// sections collapses to ONE row. Curriculum lists each word ONCE, at its first
// appearance, preserving unit -> section -> pos -> list order. Verbs carry the
// tense they're introduced in (present).
//
//   node parser/normalize_vocab.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN = join(ROOT, "data", "vocab.json");
const OUT = join(ROOT, "data", "words.json");

// pos key (in vocab.json) -> { type (stored), prefix (id), introTense }
const POS = {
  verbs: { type: "verb", prefix: "verb", tense: "present" },
  nouns: { type: "noun", prefix: "noun", tense: null },
  adjectives: { type: "adjective", prefix: "adj", tense: null },
  adverbs: { type: "adverb", prefix: "adv", tense: null },
  expressions: { type: "expression", prefix: "expr", tense: null },
};
const POS_ORDER = Object.keys(POS);

const stripArticle = (s) =>
  s.toLowerCase().replace(/^(el|la|los|las|un|una)\s+/, "").trim();

// lemma slug: article-stripped, masculine head for "famoso, famosa", diacritics
// removed, non-alphanumerics -> '-'.
function slug(es) {
  let s = stripArticle(es);
  s = s.split(",")[0].trim(); // "famoso, famosa" -> "famoso"
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s;
}

// Pick the canonical record for a word. Prefer a curated (non-"example") gloss
// over an example-harvested one; within the same tier keep the EARLIEST-seen
// (`a`), i.e. the textbook's introduction gloss — the most pedagogically aligned.
// Multi-sense nuance (llevar = to carry/to wear) is carried by the examples, not
// the headword gloss, so we don't chase the "longest" gloss (that picked up
// misleading contextual notes like tener "to get (in the preterit)").
function better(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aCurated = a.src !== "example";
  const bCurated = b.src !== "example";
  if (aCurated !== bCurated) return aCurated ? a : b;
  return a; // same tier -> keep the earlier-seen
}

const vocab = JSON.parse(readFileSync(IN, "utf8"));

const byId = new Map();        // id -> chosen record { id, type, es, en, gender, yo }
// First-appearance bookkeeping; the curriculum is assembled after the walk so we
// can append "previously-introduced verbs in the new tense" at each tense-unit.
const introOrder = new Map();  // id -> reading-order counter (first appearance)
const introUnit = new Map();   // id -> unit of first appearance
const introType = new Map();   // id -> pos type
let readCounter = 0;

// unit/section structure (preserves the existing vocab browser's grouping)
const units = [];              // [{ unit, title }]
const sections = [];           // [{ unit, section_idx, title, page }]
const sectionWords = [];       // [{ unit, section_idx, word_id, pos, ord }]

for (const unit of vocab.units) {
  units.push({ unit: unit.unit, title: unit.title });
  (unit.sections || []).forEach((section, sIdx) => {
    sections.push({ unit: unit.unit, section_idx: sIdx, title: section.title, page: section.page ?? null });
    for (const pos of POS_ORDER) {
      const meta = POS[pos];
      const seenInSection = new Set();
      let ord = 0;
      for (const w of section[pos] || []) {
        if (!w.es) continue;
        const id = `${meta.prefix}-${slug(w.es)}`;

        // merge into the word table (canonical record wins)
        const cand = {
          id, type: meta.type, es: w.es, en: w.en,
          gender: w.gender ?? null, yo: w.yo ?? null, src: w.src,
        };
        const cur = byId.get(id);
        const win = better(cur, cand);
        // keep gender/yo from whichever record has them
        win.gender = win.gender ?? cur?.gender ?? cand.gender ?? null;
        win.yo = win.yo ?? cur?.yo ?? cand.yo ?? null;
        byId.set(id, win);

        // section membership (one row per word per section/pos)
        if (!seenInSection.has(id)) {
          seenInSection.add(id);
          sectionWords.push({ unit: unit.unit, section_idx: sIdx, word_id: id, pos, ord: ord++ });
        }

        // record first appearance (curriculum assembled after the walk)
        if (!introOrder.has(id)) {
          introOrder.set(id, readCounter++);
          introUnit.set(id, unit.unit);
          introType.set(id, meta.type);
        }
      }
    }
  });
}

// ---- assemble curriculum ----
// Verbs are scheduled by TENSE. A verb is introduced in PRESENT at its first
// appearance; then at each unit that introduces a new tense, every verb seen so
// far is re-added in that tense, AFTER the unit's own new vocab. Non-verbs are a
// single typed-spelling entry at first appearance.
const TENSE_UNITS = [
  { tense: "preterite", unit: 4 },
  { tense: "imperfect", unit: 5 },
  { tense: "future", unit: 7 },
  { tense: "conditional", unit: 7 },
  { tense: "present_subjunctive", unit: 13 },
];
const entries = []; // { unit, phase, sub, item_type, word_id, tense }
for (const [id, ord] of introOrder) {
  const isVerb = introType.get(id) === "verb";
  entries.push({
    unit: introUnit.get(id), phase: 0, sub: ord,
    item_type: isVerb ? "verb_tense" : "word", word_id: id, tense: isVerb ? "present" : null,
  });
}
const verbsByOrder = [...introOrder.entries()]
  .filter(([id]) => introType.get(id) === "verb")
  .sort((a, b) => a[1] - b[1]);
TENSE_UNITS.forEach(({ tense, unit: tu }, ti) => {
  for (const [id, ord] of verbsByOrder) {
    if (introUnit.get(id) <= tu) {
      entries.push({ unit: tu, phase: ti + 1, sub: ord, item_type: "verb_tense", word_id: id, tense });
    }
  }
});
entries.sort((a, b) => a.unit - b.unit || a.phase - b.phase || a.sub - b.sub);
const curriculum = entries.map((e, i) => ({
  unit: e.unit, order_index: i, item_type: e.item_type, word_id: e.word_id, tense: e.tense,
}));

// final word rows (drop the transient src field)
const words = [...byId.values()].map(({ src, ...rest }) => rest)
  .sort((a, b) => a.id.localeCompare(b.id, "es"));

writeFileSync(OUT, JSON.stringify({ words, units, sections, sectionWords, curriculum }, null, 2) + "\n");

// ---- report ----
const byType = {};
for (const w of words) byType[w.type] = (byType[w.type] || 0) + 1;
console.log(`wrote ${OUT}`);
console.log(`  ${words.length} distinct words:`, byType);
console.log(`  ${units.length} units, ${sections.length} sections, ${sectionWords.length} section-word rows`);
const vt = curriculum.filter((c) => c.item_type === "verb_tense").length;
console.log(`  ${curriculum.length} curriculum entries (${vt} verb_tense, ${curriculum.length - vt} word)`);
