// Seed the vocab CONTENT tables in Postgres from data/words.json (produced by
// normalize_vocab.mjs) plus the Claude-generated caches. Idempotent: DROPs and
// recreates ONLY the content tables (units, sections, vocab, vocab_section_mapping,
// verb_conjugations, notes, examples), then reloads them. The SRS state tables
// (section_anki_cards, daily_word_quota) are created IF NOT EXISTS and NEVER
// truncated — they hold learning progress and have NO FK to content, so a content
// re-seed leaves progress intact.
//
// ALL id columns are UUIDs, assigned DETERMINISTICALLY (v5-style hash of a stable
// natural key) so the ids that section_anki_cards.card_id references stay identical
// across re-seeds, and so the slug-keyed caches can be remapped onto them.
//
//   DATABASE_URL=postgres://spanish:spanish@localhost:5433/spanish node parser/seed_vocab_db.mjs
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "data", "words.json"), "utf8"));

const readCache = (rel) => {
  const p = join(ROOT, "parser", "cache", ...rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

// ---- deterministic UUIDs (v5-style) from a stable natural key ----
function uuidFrom(key) {
  const h = createHash("sha1").update(key).digest("hex").slice(0, 32).split("");
  h[12] = "5"; // version
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16); // variant
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
const unitUuid = (u) => uuidFrom(`spanish-app:unit:${u}`);
const sectionUuid = (u, s) => uuidFrom(`spanish-app:section:${u}:${s}`);
const wordUuid = (slug) => uuidFrom(`spanish-app:vocab:${slug}`);
const tenseUuid = (slug, t) => uuidFrom(`spanish-app:tense:${slug}:${t}`);
const noteUuid = (u, s, prompt) => uuidFrom(`spanish-app:note:${u}:${s}:${prompt}`);
const exampleUuid = (slug, i) => uuidFrom(`spanish-app:example:${slug}:${i}`);

// slug -> word UUID. The slug never reaches the DB; it's only the cache key.
const idMap = new Map(data.words.map((w) => [w.id, wordUuid(w.id)]));

// ---- content rows ----
const unitRows = data.units.map((u) => ({
  unit_id: unitUuid(u.unit), unit_title: u.title, ord: u.unit,
}));
const sectionRows = data.sections.map((s) => ({
  section_id: sectionUuid(s.unit, s.section_idx), unit_id: unitUuid(s.unit),
  section_title: s.title, page: s.page ?? null, ord: s.section_idx,
}));
const sectionKeys = new Set(data.sections.map((s) => `${s.unit}:${s.section_idx}`));

const vocabRows = data.words.map((w) => ({
  word_id: idMap.get(w.id), type: w.type, es: w.es, en: w.en, gender: w.gender,
}));

// section <-> word join (pos/ord dropped → one row per (section, word))
const mapSeen = new Set();
const mappingRows = [];
for (const sw of data.sectionWords) {
  if (!sectionKeys.has(`${sw.unit}:${sw.section_idx}`) || !idMap.has(sw.word_id)) continue;
  const sid = sectionUuid(sw.unit, sw.section_idx);
  const wid = idMap.get(sw.word_id);
  const key = `${sid}:${wid}`;
  if (mapSeen.has(key)) continue;
  mapSeen.add(key);
  mappingRows.push({ section_id: sid, word_id: wid });
}

// verb conjugations (cached per word slug)
const TENSE_ORDER = ["present", "preterite", "imperfect", "future", "conditional", "present_subjunctive"];
const conjCache = readCache(["conjugations", "verbs.json"]) ?? {};
const conjRows = [];
for (const slug of Object.keys(conjCache).sort()) {
  if (!idMap.has(slug)) continue;
  const tenses = conjCache[slug];
  const ordered = Object.keys(tenses).sort(
    (a, b) => (TENSE_ORDER.indexOf(a) - TENSE_ORDER.indexOf(b)) || a.localeCompare(b)
  );
  for (const tense of ordered) {
    const f = tenses[tense];
    conjRows.push({ tense_id: tenseUuid(slug, tense), word_id: idMap.get(slug), tense, yo: f.yo, tu: f.tu, el: f.el, nosotros: f.nosotros, ellos: f.ellos });
  }
}

// notes (grammar/usage/idiom cards), generated per section
const conceptsCache = readCache(["concepts", "cards.json"]) ?? [];
const noteRows = [];
for (const c of conceptsCache) {
  if (!sectionKeys.has(`${c.unit}:${c.sectionIdx}`)) continue;
  noteRows.push({
    note_id: noteUuid(c.unit, c.sectionIdx, c.prompt), section_id: sectionUuid(c.unit, c.sectionIdx),
    note_prompt: c.prompt, note_answer: c.answer, kind: c.kind ?? null,
  });
}

// example sentences (cached per word slug)
const exampleRows = [];
for (const rel of [["examples", "verbs.json"], ["nonverb-examples", "words.json"]]) {
  const cache = readCache(rel) ?? {};
  for (const slug of Object.keys(cache).sort()) {
    if (!idMap.has(slug)) continue;
    cache[slug].forEach((e, i) => {
      exampleRows.push({ example_id: exampleUuid(slug, i), word_id: idMap.get(slug), example_en: e.en, example_es: e.es });
    });
  }
}

// ---- master ordered deck: every study card in textbook order ----
// THE source of truth for what to study next and in what order. Notes lead each
// unit, then that unit's words + verb-tenses in curriculum order. Because tense
// progression lives here (Unit 1 = present only; preterite/imperfect/… appear in
// their later units, with earlier verbs re-drilled cumulatively), a card can never
// surface before its unit. card_id holds the note_id / word_id / tense_id uuid.
const conjKeys = new Set(conjRows.map((r) => `${r.word_id}|${r.tense}`)); // word_id = uuid
// first section a word appears in within a unit (best-effort section attribution)
const wordSectionInUnit = new Map();
for (const sw of data.sectionWords) {
  const k = `${sw.unit}:${sw.word_id}`;
  if (!wordSectionInUnit.has(k)) wordSectionInUnit.set(k, sw.section_idx);
}
const sectionIdInUnit = (unit, slug) => {
  const si = wordSectionInUnit.get(`${unit}:${slug}`);
  return si != null && sectionKeys.has(`${unit}:${si}`) ? sectionUuid(unit, si) : null;
};
// notes grouped by unit (concepts cache), ordered by section then appearance
const notesByUnit = new Map();
conceptsCache.forEach((c, i) => {
  if (!sectionKeys.has(`${c.unit}:${c.sectionIdx}`)) return;
  if (!notesByUnit.has(c.unit)) notesByUnit.set(c.unit, []);
  notesByUnit.get(c.unit).push({ sort: c.sectionIdx * 100000 + i, card_id: noteUuid(c.unit, c.sectionIdx, c.prompt), section_id: sectionUuid(c.unit, c.sectionIdx) });
});
// curriculum (words + verb tenses) grouped by unit
const curByUnit = new Map();
for (const e of data.curriculum) {
  if (!curByUnit.has(e.unit)) curByUnit.set(e.unit, []);
  curByUnit.get(e.unit).push(e);
}
const deckSeen = new Set();
const deckRows = [];
let deckOrd = 0;
const allUnits = [...new Set([...notesByUnit.keys(), ...curByUnit.keys()])].sort((a, b) => a - b);
for (const u of allUnits) {
  for (const n of (notesByUnit.get(u) ?? []).sort((a, b) => a.sort - b.sort)) {
    const key = `note_id|${n.card_id}`;
    if (deckSeen.has(key)) continue;
    deckSeen.add(key);
    deckRows.push({ card_id: n.card_id, card_type: "note_id", unit_id: unitUuid(u), section_id: n.section_id, ord: deckOrd++ });
  }
  for (const e of (curByUnit.get(u) ?? []).sort((a, b) => a.order_index - b.order_index)) {
    if (!idMap.has(e.word_id)) continue;
    const wid = idMap.get(e.word_id);
    let cardId, cardType;
    if (e.item_type === "verb_tense") {
      if (!conjKeys.has(`${wid}|${e.tense}`)) continue;
      cardId = tenseUuid(e.word_id, e.tense); cardType = "tense_id";
    } else {
      cardId = wid; cardType = "word_id";
    }
    const key = `${cardType}|${cardId}`;
    if (deckSeen.has(key)) continue;
    deckSeen.add(key);
    deckRows.push({ card_id: cardId, card_type: cardType, unit_id: unitUuid(u), section_id: sectionIdInUnit(u, e.word_id), ord: deckOrd++ });
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (e.g. postgres://spanish:spanish@localhost:5433/spanish)");
  process.exit(1);
}
const needsSsl = /sslmode=require|neon\.tech|render\.com/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });

const SCHEMA = `
-- drop legacy + content tables (one-time rename from the old schema, then a clean
-- content reload on every run). section_anki_cards / daily_word_quota are NOT here.
DROP TABLE IF EXISTS curriculum CASCADE;
DROP TABLE IF EXISTS card_deck CASCADE;
DROP TABLE IF EXISTS vocab_section_words CASCADE;
DROP TABLE IF EXISTS vocab_section_mapping CASCADE;
DROP TABLE IF EXISTS verb_tenses CASCADE;
DROP TABLE IF EXISTS verb_conjugations CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS examples CASCADE;
DROP TABLE IF EXISTS vocab_sections CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS vocab_units CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS vocab CASCADE;

CREATE TABLE units (
  unit_id    uuid PRIMARY KEY,
  unit_title text NOT NULL,
  ord        int  NOT NULL
);
CREATE TABLE sections (
  section_id    uuid PRIMARY KEY,
  unit_id       uuid NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
  section_title text NOT NULL,
  page          int,
  ord           int  NOT NULL
);
CREATE TABLE vocab (
  word_id uuid PRIMARY KEY,
  type    text NOT NULL,           -- verb | noun | adjective | adverb | expression
  es      text NOT NULL,
  en      text NOT NULL,
  gender  text
);
CREATE TABLE vocab_section_mapping (
  section_id uuid NOT NULL REFERENCES sections(section_id) ON DELETE CASCADE,
  word_id    uuid NOT NULL REFERENCES vocab(word_id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, word_id)
);
CREATE TABLE verb_conjugations (
  tense_id uuid PRIMARY KEY,
  word_id  uuid NOT NULL REFERENCES vocab(word_id) ON DELETE CASCADE,
  tense    text NOT NULL,          -- present | preterite | imperfect | ...
  yo text, tu text, el text, nosotros text, ellos text,  -- el = el/ella/usted, ellos = ellos/ellas/ustedes
  UNIQUE (word_id, tense)
);
CREATE TABLE notes (
  note_id     uuid PRIMARY KEY,
  section_id  uuid NOT NULL REFERENCES sections(section_id) ON DELETE CASCADE,
  note_prompt text NOT NULL,
  note_answer text NOT NULL,
  kind        text                 -- conjugation_rule | usage | idiom
);
CREATE TABLE examples (
  example_id uuid PRIMARY KEY,
  word_id    uuid NOT NULL REFERENCES vocab(word_id) ON DELETE CASCADE,
  example_en text NOT NULL,
  example_es text NOT NULL
);

-- the master ordered study deck (content; rebuilt every seed). Polymorphic card_id
-- (word_id/tense_id/note_id) + card_type discriminator, ordered globally by ord.
CREATE TABLE card_deck (
  card_id    uuid NOT NULL,
  card_type  text NOT NULL,        -- 'word_id' | 'tense_id' | 'note_id'
  unit_id    uuid REFERENCES units(unit_id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(section_id) ON DELETE CASCADE,
  ord        int  NOT NULL,
  PRIMARY KEY (card_type, card_id)
);

CREATE INDEX idx_card_deck_ord ON card_deck(ord);
CREATE INDEX idx_vocab_type ON vocab(type);
CREATE INDEX idx_sections_unit ON sections(unit_id, ord);
CREATE INDEX idx_mapping_word ON vocab_section_mapping(word_id);
CREATE INDEX idx_conj_word ON verb_conjugations(word_id);
CREATE INDEX idx_notes_section ON notes(section_id);
CREATE INDEX idx_examples_word ON examples(word_id);

-- ---- single-user SRS state (NO user_id, NO FK to content; survives re-seeds) ----
-- card_id holds the UUID of the referenced row; card_type names which table:
--   card_type='word_id'  -> card_id = vocab.word_id
--   card_type='tense_id' -> card_id = verb_conjugations.tense_id
--   card_type='note_id'  -> card_id = notes.note_id
CREATE TABLE IF NOT EXISTS section_anki_cards (
  card_id                uuid NOT NULL,
  card_type              text NOT NULL,                 -- 'word_id' | 'tense_id' | 'note_id'
  section_id             uuid,                           -- which section this card belongs to
  ord                    int,                            -- study order (copied from card_deck)
  status                 text NOT NULL DEFAULT 'new',    -- 'new' | 'review'
  stage                  int  NOT NULL DEFAULT 0,        -- 0 new; then 1,2,4,8,16,…
  in_a_row               int  NOT NULL DEFAULT 0,        -- consecutive correct THIS session
  wrong_streak           boolean NOT NULL DEFAULT false, -- a prior errored completion is pending (penalty)
  incorrect_this_session boolean NOT NULL DEFAULT false, -- erred at least once this session
  next_due               date,
  last_reviewed          timestamptz,
  PRIMARY KEY (card_type, card_id)
);
ALTER TABLE section_anki_cards ADD COLUMN IF NOT EXISTS ord int;
ALTER TABLE section_anki_cards ADD COLUMN IF NOT EXISTS incorrect_this_session boolean NOT NULL DEFAULT false;
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='section_anki_cards' AND column_name='wrong_streak' AND data_type <> 'boolean') THEN
    ALTER TABLE section_anki_cards ALTER COLUMN wrong_streak DROP DEFAULT;
    ALTER TABLE section_anki_cards ALTER COLUMN wrong_streak TYPE boolean USING (wrong_streak::int <> 0);
    ALTER TABLE section_anki_cards ALTER COLUMN wrong_streak SET DEFAULT false;
  END IF;
END $do$;
CREATE INDEX IF NOT EXISTS idx_anki_due ON section_anki_cards(next_due);
CREATE INDEX IF NOT EXISTS idx_anki_section ON section_anki_cards(section_id);

CREATE TABLE IF NOT EXISTS daily_word_quota (
  day       date PRIMARY KEY,
  available int  NOT NULL
);

-- per-day session tally (one session per day), for the end-of-session summary.
CREATE TABLE IF NOT EXISTS daily_session_log (
  day               date PRIMARY KEY,
  new_seen          int NOT NULL DEFAULT 0,
  reviews_completed int NOT NULL DEFAULT 0,
  correct           int NOT NULL DEFAULT 0,
  wrong             int NOT NULL DEFAULT 0
);

-- the single unit/section the learner is currently working through (singleton row;
-- NO FK to content so a re-seed never wipes it — the uuids are deterministic/stable).
CREATE TABLE IF NOT EXISTS current_position (
  id         boolean PRIMARY KEY DEFAULT true,
  unit_id    uuid,
  section_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT current_position_singleton CHECK (id)
);

-- one-time cleanup of the old multi-user progress tables (replaced by the above)
DROP TABLE IF EXISTS srs_progress CASCADE;
DROP TABLE IF EXISTS srs_daily_log CASCADE;
`;

// chunked multi-row insert
async function bulkInsert(client, table, columns, rows, chunk = 500) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const values = [];
    const params = [];
    slice.forEach((row, r) => {
      const ph = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      values.push(`(${ph.join(",")})`);
      for (const col of columns) params.push(row[col]);
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values.join(",")}`,
      params
    );
    inserted += slice.length;
  }
  return inserted;
}

const client = await pool.connect();
try {
  await client.query(SCHEMA);
  await client.query("BEGIN");

  const nUnits = await bulkInsert(client, "units", ["unit_id", "unit_title", "ord"], unitRows);
  const nSecs = await bulkInsert(client, "sections", ["section_id", "unit_id", "section_title", "page", "ord"], sectionRows);
  const nWords = await bulkInsert(client, "vocab", ["word_id", "type", "es", "en", "gender"], vocabRows);
  const nMap = await bulkInsert(client, "vocab_section_mapping", ["section_id", "word_id"], mappingRows);
  const nConj = await bulkInsert(client, "verb_conjugations", ["tense_id", "word_id", "tense", "yo", "tu", "el", "nosotros", "ellos"], conjRows);
  const nNotes = await bulkInsert(client, "notes", ["note_id", "section_id", "note_prompt", "note_answer", "kind"], noteRows);
  const nEx = await bulkInsert(client, "examples", ["example_id", "word_id", "example_en", "example_es"], exampleRows);
  const nDeck = await bulkInsert(client, "card_deck", ["card_id", "card_type", "unit_id", "section_id", "ord"], deckRows);

  await client.query("COMMIT");
  console.log(`seeded: ${nUnits} units, ${nSecs} sections, ${nWords} vocab, ${nMap} section-mappings, ${nConj} conjugations, ${nNotes} notes, ${nEx} examples, ${nDeck} deck cards`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("seed failed, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
