// Per-user SRS progress + daily session assembly. Dedicated relational tables
// (srs_progress, srs_daily_log) — NOT the legacy generic `progress` store — so
// re-seeding vocab content never touches a learner's progress (no FK to vocab).
// Wires the pure engine in lib/srs.ts to Postgres. Server-only.
import "server-only";
import { getPool } from "./store";
import { firstEncounter, completeReview, streakNeeded, type Rating, type Progress } from "./srs";

export const DAILY_NEW_GOAL = 10;

export interface SessionCard {
  cardKey: string; // `${type}:${refId}`
  type: "word";
  refId: string;
  wordType: string; // verb | noun | ...
  prompt: string; // English (shown)
  answer: string; // Spanish (typed)
  gender: string | null;
  examples: { es: string; en: string }[];
  stage: number; // 0 = new
  streakNeeded: number;
}

export interface ConjForms { yo: string; tu: string; el: string; nosotros: string; ellos: string }
// A verb is ALWAYS studied as (verb, tense): type the infinitive, then conjugate
// the whole tense. refId = `${wordId}:${tense}`. Stats tracked per (verb, tense).
export interface VerbCard {
  cardKey: string; type: "verb_tense"; refId: string;
  infinitive: string; en: string; tense: string;
  forms: ConjForms;
  examples: { es: string; en: string }[]; // English shown as context (2)
  stage: number; streakNeeded: number;
}

export interface FlashCard {
  cardKey: string; type: "flashcard"; refId: string;
  kind: string; prompt: string; answer: string; tense: string | null;
  unit: number; stage: number;
}

export type StudyCard = SessionCard | VerbCard | FlashCard;

export interface SessionPayload {
  reviews: StudyCard[];   // word | verb_tense | flashcard, all from the one curriculum list
  newCards: StudyCard[];
  dailyNewDone: number;
  dailyNewRemaining: number;
  dueCount: number;
}

const NEW_BUFFER = 30; // extra new candidates so "known" first-sights don't starve the session
const splitVerbRef = (ref: string): [string, string] => {
  const i = ref.lastIndexOf(":");
  return [ref.slice(0, i), ref.slice(i + 1)];
};

let _ready: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (_ready) return _ready;
  _ready = (async () => {
    const pool = await getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS srs_progress (
        user_id text NOT NULL,
        card_type text NOT NULL,
        ref_id text NOT NULL,
        stage int NOT NULL DEFAULT 0,
        wrong_streak int NOT NULL DEFAULT 0,
        next_due date,
        last_reviewed timestamptz,
        status text NOT NULL DEFAULT 'new',
        PRIMARY KEY (user_id, card_type, ref_id)
      );
      CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_progress(user_id, next_due);
      CREATE TABLE IF NOT EXISTS srs_daily_log (
        user_id text NOT NULL,
        day date NOT NULL,
        new_words int NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      );
    `);
  })();
  return _ready;
}

const today = () => new Date().toISOString().slice(0, 10);
const cardKey = (type: string, refId: string) => `${type}:${refId}`;

interface WordRow { id_word: string; type: string; es: string; en: string; gender: string | null }

async function resolveWordCards(ids: string[]): Promise<Map<string, SessionCard>> {
  const map = new Map<string, SessionCard>();
  if (!ids.length) return map;
  const pool = await getPool();
  const words = await pool.query<WordRow>(
    `SELECT id_word, type, es, en, gender FROM vocab WHERE id_word = ANY($1)`,
    [ids]
  );
  const ex = await pool.query<{ word_id: string; ex_es: string; ex_en: string }>(
    `SELECT word_id, ex_es, ex_en FROM examples WHERE word_id = ANY($1) ORDER BY word_id, idx`,
    [ids]
  );
  const byWord = new Map<string, { es: string; en: string }[]>();
  for (const e of ex.rows) {
    if (!byWord.has(e.word_id)) byWord.set(e.word_id, []);
    byWord.get(e.word_id)!.push({ es: e.ex_es, en: e.ex_en });
  }
  for (const w of words.rows) {
    map.set(w.id_word, {
      cardKey: cardKey("word", w.id_word),
      type: "word",
      refId: w.id_word,
      wordType: w.type,
      prompt: w.en,
      answer: w.es,
      gender: w.gender,
      examples: byWord.get(w.id_word) ?? [],
      stage: 0,
      streakNeeded: streakNeeded(0),
    });
  }
  return map;
}

/** Resolve (verb, tense) study cards: infinitive + that tense's forms + 2 example sentences. */
async function resolveVerbCards(entries: { wordId: string; tense: string; stage: number }[]): Promise<VerbCard[]> {
  if (!entries.length) return [];
  const pool = await getPool();
  const wordIds = [...new Set(entries.map((e) => e.wordId))];
  const tenses = [...new Set(entries.map((e) => e.tense))];
  const forms = await pool.query<{ word_id: string; tense: string; yo: string; tu: string; el: string; nosotros: string; ellos: string }>(
    `SELECT word_id, tense, yo, tu, el, nosotros, ellos FROM verb_tenses WHERE word_id = ANY($1) AND tense = ANY($2)`,
    [wordIds, tenses]
  );
  const fMap = new Map(forms.rows.map((r) => [`${r.word_id}:${r.tense}`, r]));
  const meta = await pool.query<{ id_word: string; es: string; en: string }>(
    `SELECT id_word, es, en FROM vocab WHERE id_word = ANY($1)`, [wordIds]
  );
  const mMap = new Map(meta.rows.map((r) => [r.id_word, r]));
  const ex = await pool.query<{ word_id: string; ex_es: string; ex_en: string }>(
    `SELECT word_id, ex_es, ex_en FROM examples WHERE word_id = ANY($1) ORDER BY word_id, idx`, [wordIds]
  );
  const exMap = new Map<string, { es: string; en: string }[]>();
  for (const e of ex.rows) {
    if (!exMap.has(e.word_id)) exMap.set(e.word_id, []);
    exMap.get(e.word_id)!.push({ es: e.ex_es, en: e.ex_en });
  }
  const out: VerbCard[] = [];
  for (const { wordId, tense, stage } of entries) {
    const f = fMap.get(`${wordId}:${tense}`);
    const m = mMap.get(wordId);
    if (!f || !m) continue; // missing conjugation/meta
    out.push({
      cardKey: cardKey("verb_tense", `${wordId}:${tense}`),
      type: "verb_tense", refId: `${wordId}:${tense}`,
      infinitive: m.es, en: m.en, tense,
      forms: { yo: f.yo, tu: f.tu, el: f.el, nosotros: f.nosotros, ellos: f.ellos },
      examples: exMap.get(wordId) ?? [],
      stage, streakNeeded: streakNeeded(stage),
    });
  }
  return out;
}

async function resolveFlashcards(ids: number[], stages: Map<string, number>): Promise<FlashCard[]> {
  if (!ids.length) return [];
  const pool = await getPool();
  const r = await pool.query<{ id_flashcard: number; unit: number; kind: string; prompt: string; answer: string; tense: string | null }>(
    `SELECT id_flashcard, unit, kind, prompt, answer, tense FROM flashcards WHERE id_flashcard = ANY($1)`,
    [ids]
  );
  return r.rows.map((f) => {
    const refId = String(f.id_flashcard);
    return {
      cardKey: cardKey("flashcard", refId), type: "flashcard" as const, refId,
      kind: f.kind, prompt: f.prompt, answer: f.answer, tense: f.tense, unit: f.unit,
      stage: stages.get(refId) ?? 0,
    };
  });
}

/** Assemble today's session: due reviews + new cards (curriculum order). */
export async function getSession(user: string): Promise<SessionPayload> {
  await ensureSchema();
  const pool = await getPool();
  const day = today();

  // daily new-word tally
  const log = await pool.query<{ new_words: number }>(
    "SELECT new_words FROM srs_daily_log WHERE user_id=$1 AND day=$2",
    [user, day]
  );
  const dailyNewDone = log.rows[0]?.new_words ?? 0;
  const dailyNewRemaining = Math.max(0, DAILY_NEW_GOAL - dailyNewDone);

  // --- due reviews: word + verb_tense + flashcard ---
  const due = await pool.query<{ card_type: string; ref_id: string; stage: number }>(
    `SELECT card_type, ref_id, stage FROM srs_progress
      WHERE user_id=$1 AND card_type IN ('word','verb_tense','flashcard') AND next_due IS NOT NULL AND next_due <= $2
      ORDER BY next_due, stage`,
    [user, day]
  );
  const dueWordMap = await resolveWordCards(due.rows.filter((r) => r.card_type === "word").map((r) => r.ref_id));
  const dueVerbMap = new Map((await resolveVerbCards(due.rows.filter((r) => r.card_type === "verb_tense").map((r) => {
    const [wordId, tense] = splitVerbRef(r.ref_id);
    return { wordId, tense, stage: r.stage };
  }))).map((c) => [c.refId, c]));
  const flashStages = new Map(due.rows.filter((r) => r.card_type === "flashcard").map((r) => [r.ref_id, r.stage]));
  const dueFlashMap = new Map((await resolveFlashcards(due.rows.filter((r) => r.card_type === "flashcard").map((r) => Number(r.ref_id)), flashStages)).map((c) => [c.refId, c]));
  const reviews: StudyCard[] = [];
  for (const r of due.rows) {
    if (r.card_type === "word") {
      const c = dueWordMap.get(r.ref_id);
      if (c) reviews.push({ ...c, stage: r.stage, streakNeeded: streakNeeded(r.stage) });
    } else if (r.card_type === "verb_tense") {
      const c = dueVerbMap.get(r.ref_id); if (c) reviews.push(c);
    } else {
      const c = dueFlashMap.get(r.ref_id); if (c) reviews.push(c);
    }
  }

  // --- new cards: the one curriculum list (words + verb_tense + flashcards), not yet seen ---
  const allProg = await pool.query<{ card_type: string; ref_id: string }>(
    "SELECT card_type, ref_id FROM srs_progress WHERE user_id=$1", [user]
  );
  const seenKeys = new Set(allProg.rows.map((r) => `${r.card_type}:${r.ref_id}`));
  // Only "don't know" first-sights count toward the daily 10, so pull a buffer of
  // extra candidates — "known" cards leave without using up the day's allotment.
  const limit = dailyNewRemaining > 0 ? dailyNewRemaining + NEW_BUFFER : 0;
  const cur = await pool.query<{ item_type: string; word_id: string | null; tense: string | null; flashcard_id: number | null }>(
    `SELECT item_type, word_id, tense, flashcard_id FROM curriculum ORDER BY order_index`
  );
  const newPicks: { item_type: string; word_id: string | null; tense: string | null; flashcard_id: number | null; ck: string }[] = [];
  for (const row of cur.rows) {
    if (newPicks.length >= limit) break;
    const ck = row.item_type === "word" ? `word:${row.word_id}`
      : row.item_type === "verb_tense" ? `verb_tense:${row.word_id}:${row.tense}`
      : `flashcard:${row.flashcard_id}`;
    if (!seenKeys.has(ck)) newPicks.push({ ...row, ck });
  }
  const newWordMap = await resolveWordCards(newPicks.filter((p) => p.item_type === "word").map((p) => p.word_id!));
  const newVerbMap = new Map(
    (await resolveVerbCards(newPicks.filter((p) => p.item_type === "verb_tense").map((p) => ({ wordId: p.word_id!, tense: p.tense!, stage: 0 })))).map((c) => [c.cardKey, c])
  );
  const newFlashMap = new Map(
    (await resolveFlashcards(newPicks.filter((p) => p.item_type === "flashcard").map((p) => p.flashcard_id!), new Map())).map((c) => [c.cardKey, c])
  );
  const newCards: StudyCard[] = [];
  for (const p of newPicks) {
    const c = p.item_type === "word" ? newWordMap.get(p.word_id!) : p.item_type === "verb_tense" ? newVerbMap.get(p.ck) : newFlashMap.get(p.ck);
    if (c) newCards.push(c);
  }

  return { reviews, newCards, dailyNewDone, dailyNewRemaining, dueCount: reviews.length };
}

async function loadProgress(user: string, type: string, refId: string): Promise<Progress> {
  const pool = await getPool();
  const r = await pool.query<{ stage: number; wrong_streak: number }>(
    "SELECT stage, wrong_streak FROM srs_progress WHERE user_id=$1 AND card_type=$2 AND ref_id=$3",
    [user, type, refId]
  );
  return r.rows[0] ? { stage: r.rows[0].stage, wrongStreak: r.rows[0].wrong_streak } : { stage: 0, wrongStreak: 0 };
}

async function saveProgress(user: string, type: string, refId: string, p: Progress, intervalDays: number): Promise<string> {
  const pool = await getPool();
  const due = new Date(Date.now() + intervalDays * 86400000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO srs_progress (user_id, card_type, ref_id, stage, wrong_streak, next_due, last_reviewed, status)
     VALUES ($1,$2,$3,$4,$5,$6, now(), 'review')
     ON CONFLICT (user_id, card_type, ref_id)
     DO UPDATE SET stage=EXCLUDED.stage, wrong_streak=EXCLUDED.wrong_streak,
                   next_due=EXCLUDED.next_due, last_reviewed=now(), status='review'`,
    [user, type, refId, p.stage, p.wrongStreak, due]
  );
  return due;
}

async function bumpDailyNew(user: string): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO srs_daily_log (user_id, day, new_words) VALUES ($1,$2,1)
     ON CONFLICT (user_id, day) DO UPDATE SET new_words = srs_daily_log.new_words + 1`,
    [user, today()]
  );
}

export interface CompleteResult { stage: number; intervalDays: number; nextDue: string; outcome: string; countedNew: boolean }

/**
 * Persist a card that has just left the session.
 *  - kind 'first': a brand-new "know"/"really_know" — scheduled out (stage 4/8),
 *    does NOT count toward the daily goal.
 *  - kind 'learn_start': a brand-new "I don't know" set aside for drilling. Counts
 *    toward the daily 10 and lands at stage 1 but stays **due today** — the learner
 *    still owes the 3-in-a-row, so it remains in "review today" until graduated.
 *  - kind 'learn_done': that "I don't know" finished its 3-in-a-row → now schedule
 *    it forward (stage 1, +1 day). Does NOT re-count toward the daily goal.
 *  - kind 'review': an already-seen card; `erred` = missed at least once this session.
 */
export async function completeCard(
  user: string,
  type: string,
  refId: string,
  opts:
    | { kind: "first"; rating: Rating }
    | { kind: "learn_start" }
    | { kind: "learn_done" }
    | { kind: "review"; erred: boolean }
): Promise<CompleteResult> {
  await ensureSchema();
  if (opts.kind === "first") {
    const r = firstEncounter(opts.rating); // know → stage 4, really_know → stage 8
    const nextDue = await saveProgress(user, type, refId, r.progress, r.intervalDays);
    return { stage: r.progress.stage, intervalDays: r.intervalDays, nextDue, outcome: "first", countedNew: false };
  }
  if (opts.kind === "learn_start") {
    // Stage 1 but interval 0 → due TODAY: it's counted as a new word for the day,
    // yet still owed (3-in-a-row) so it shows up under today's reviews until done.
    const nextDue = await saveProgress(user, type, refId, { stage: 1, wrongStreak: 0 }, 0);
    await bumpDailyNew(user);
    return { stage: 1, intervalDays: 0, nextDue, outcome: "learn_start", countedNew: true };
  }
  if (opts.kind === "learn_done") {
    // Drilled to 3-in-a-row → schedule the stage-1 card forward (+1 day). No re-count.
    const nextDue = await saveProgress(user, type, refId, { stage: 1, wrongStreak: 0 }, 1);
    return { stage: 1, intervalDays: 1, nextDue, outcome: "learn_done", countedNew: false };
  }
  const p = await loadProgress(user, type, refId);
  const r = completeReview(p, opts.erred);
  const nextDue = await saveProgress(user, type, refId, r.progress, r.intervalDays);
  return { stage: r.progress.stage, intervalDays: r.intervalDays, nextDue, outcome: r.outcome, countedNew: false };
}

/** True when the daily goal is met (new-word quota done AND no reviews left due). */
export async function isDailyComplete(user: string): Promise<boolean> {
  const s = await getSession(user);
  return s.dailyNewRemaining === 0 && s.dueCount === 0;
}

// ---- overview (the landing screen before a session starts) ----

export interface OverviewRow {
  type: "word" | "verb_tense" | "flashcard";
  refId: string;
  label: string;          // Spanish word / infinitive / flashcard prompt
  en: string | null;      // English gloss (null for flashcards)
  tense: string | null;   // verb tense, when type = verb_tense
  unit: number | null;
  unitTitle: string | null;
  sectionTitle: string | null;
  stage: number | null;   // null = not yet started
  nextDue: string | null; // YYYY-MM-DD
}
export interface OverviewPayload {
  upcoming: OverviewRow[];   // not-yet-seen, curriculum order (capped)
  dueToday: OverviewRow[];   // next_due <= today, with stage
  future: OverviewRow[];     // next_due > today, ordered by date then stage
  dailyNewDone: number;
  dailyNewRemaining: number;
  upcomingTruncated: boolean;
}

const UPCOMING_LIMIT = 80;

interface OverviewQueryRow {
  type: string; ref_id: string; es: string | null; en: string | null; tense: string | null;
  unit: number | null; unit_title: string | null; section_title: string | null;
  stage: number | null; next_due: string | null;
}
const toOverviewRow = (r: OverviewQueryRow): OverviewRow => ({
  type: r.type as OverviewRow["type"], refId: r.ref_id, label: r.es ?? "—", en: r.en, tense: r.tense,
  unit: r.unit, unitTitle: r.unit_title, sectionTitle: r.section_title, stage: r.stage, nextDue: r.next_due,
});

/** Data for the Anki landing screen: upcoming new words + today's reviews + the future schedule. */
export async function getOverview(user: string): Promise<OverviewPayload> {
  await ensureSchema();
  const pool = await getPool();
  const day = today();

  const log = await pool.query<{ new_words: number }>(
    "SELECT new_words FROM srs_daily_log WHERE user_id=$1 AND day=$2", [user, day]
  );
  const dailyNewDone = log.rows[0]?.new_words ?? 0;
  const dailyNewRemaining = Math.max(0, DAILY_NEW_GOAL - dailyNewDone);

  // Upcoming: curriculum items the user has never seen, in order.
  const up = await pool.query<OverviewQueryRow>(
    `WITH items AS (
       SELECT c.order_index, c.item_type, c.word_id, c.tense, c.flashcard_id,
         CASE c.item_type WHEN 'verb_tense' THEN 'verb_tense' WHEN 'flashcard' THEN 'flashcard' ELSE 'word' END AS card_type,
         CASE c.item_type WHEN 'word' THEN c.word_id WHEN 'verb_tense' THEN c.word_id || ':' || c.tense ELSE c.flashcard_id::text END AS ref_id
       FROM curriculum c
     )
     SELECT i.card_type AS type, i.ref_id, i.tense,
       COALESCE(v.es, fc.prompt) AS es, v.en AS en,
       COALESCE(fc.unit, sw.unit) AS unit, su.title AS section_title, vu.title AS unit_title,
       NULL::int AS stage, NULL::text AS next_due
     FROM items i
     LEFT JOIN srs_progress p ON p.user_id=$1 AND p.card_type=i.card_type AND p.ref_id=i.ref_id
     LEFT JOIN vocab v ON i.item_type IN ('word','verb_tense') AND v.id_word=i.word_id
     LEFT JOIN flashcards fc ON i.item_type='flashcard' AND fc.id_flashcard=i.flashcard_id
     LEFT JOIN LATERAL (SELECT unit, section_idx FROM vocab_section_words WHERE word_id=i.word_id ORDER BY unit, section_idx LIMIT 1) sw ON i.item_type IN ('word','verb_tense')
     LEFT JOIN vocab_sections su ON su.unit=COALESCE(fc.unit, sw.unit) AND su.section_idx=COALESCE(fc.section_idx, sw.section_idx)
     LEFT JOIN vocab_units vu ON vu.unit=COALESCE(fc.unit, sw.unit)
     WHERE p.user_id IS NULL
     ORDER BY i.order_index
     LIMIT ${UPCOMING_LIMIT + 1}`,
    [user]
  );

  // Everything the user has started, with stage + next due, for the today/future split.
  const prog = await pool.query<OverviewQueryRow>(
    `WITH p AS (
       SELECT card_type, ref_id, stage, next_due,
         CASE WHEN card_type IN ('word','verb_tense') THEN split_part(ref_id, ':', 1) END AS word_id,
         CASE WHEN card_type='verb_tense' THEN split_part(ref_id, ':', 2) END AS tense,
         CASE WHEN card_type='flashcard' THEN ref_id::bigint END AS fc_id
       FROM srs_progress WHERE user_id=$1
     )
     SELECT p.card_type AS type, p.ref_id, p.tense, p.stage,
       to_char(p.next_due, 'YYYY-MM-DD') AS next_due,
       COALESCE(v.es, fc.prompt) AS es, v.en AS en,
       COALESCE(fc.unit, sw.unit) AS unit, su.title AS section_title, vu.title AS unit_title
     FROM p
     LEFT JOIN vocab v ON v.id_word = p.word_id
     LEFT JOIN flashcards fc ON fc.id_flashcard = p.fc_id
     LEFT JOIN LATERAL (SELECT unit, section_idx FROM vocab_section_words WHERE word_id = p.word_id ORDER BY unit, section_idx LIMIT 1) sw ON p.word_id IS NOT NULL
     LEFT JOIN vocab_sections su ON su.unit = COALESCE(fc.unit, sw.unit) AND su.section_idx = COALESCE(fc.section_idx, sw.section_idx)
     LEFT JOIN vocab_units vu ON vu.unit = COALESCE(fc.unit, sw.unit)
     ORDER BY p.next_due NULLS LAST, p.stage`,
    [user]
  );

  const upcoming = up.rows.slice(0, UPCOMING_LIMIT).map(toOverviewRow);
  const progRows = prog.rows.map(toOverviewRow);
  const dueToday = progRows.filter((r) => r.nextDue && r.nextDue <= day);
  const future = progRows.filter((r) => r.nextDue && r.nextDue > day);

  return {
    upcoming, dueToday, future, dailyNewDone, dailyNewRemaining,
    upcomingTruncated: up.rows.length > UPCOMING_LIMIT,
  };
}
