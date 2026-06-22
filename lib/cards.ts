// Card retrieval for the Anki section. A "card" is one row of section_anki_cards
// (card_type ∈ word_id|tense_id|note_id; card_id holds the referenced row's UUID)
// hydrated with its content: the conjugation/word/examples or the note.
//
// Three retrieval paths:
//   getReviewCards()  — every card whose next_due has arrived (today's reviews).
//   getNewCards(n)    — the next n not-yet-started cards from the current section.
//   getKnownCards()   — lightweight summaries (stage + name) for the overview table.
//
// Plus the single-user "where am I" position (current_position). Server-only.
import "server-only";
import { getPool } from "./store";

export type CardType = "word_id" | "tense_id" | "note_id";

export interface CardInfo {
  cardId: string;
  cardType: CardType;
  section: string | null; // section_id this card belongs to
  status: string;         // 'new' | 'review'
}
export interface CardStats {
  stage: number;
  inARow: number;
  wrongStreak: boolean;
  nextDue: string | null;      // YYYY-MM-DD
  lastReviewed: string | null; // ISO timestamp
}
// el = el/ella/usted, ellos = ellos/ellas/ustedes (DB column names kept short)
export interface Conjugation {
  tense: string;
  yo: string | null; tu: string | null; el: string | null;
  nosotros: string | null; ellos: string | null;
}
export interface Word {
  wordId: string; type: string; en: string; es: string; gender: string | null;
}
export interface Example { exampleId: string; exampleEn: string; exampleEs: string; }
export interface Note { noteId: string; notePrompt: string; noteAnswer: string; }

/** The full card handed to the study UI. Optional blocks depend on card_type. */
export interface Card {
  info: CardInfo;
  stats: CardStats;
  conjugation?: Conjugation; // tense cards
  word?: Word;               // word + tense cards
  examples?: Example[];      // word + tense cards
  note?: Note;               // note cards
}

/** Lightweight row for the "known words" overview table. */
export interface CardSummary {
  cardId: string;
  cardType: CardType;
  name: string;           // Spanish word / infinitive / note prompt
  en: string | null;      // English gloss (null for notes)
  wordType: string | null;
  tense: string | null;
  section: string | null;
  stage: number;
  status: string;
  nextDue: string | null;
  lastReviewed: string | null;
}

export interface Position { unitId: string | null; sectionId: string | null; }

const today = () => new Date().toISOString().slice(0, 10);
const isoOrNull = (v: unknown): string | null =>
  v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v as string).toISOString());

let _ready: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const pool = await getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS section_anki_cards (
          card_id uuid NOT NULL, card_type text NOT NULL, section_id uuid, ord int,
          status text NOT NULL DEFAULT 'new', stage int NOT NULL DEFAULT 0,
          in_a_row int NOT NULL DEFAULT 0, wrong_streak boolean NOT NULL DEFAULT false,
          incorrect_this_session boolean NOT NULL DEFAULT false,
          next_due date, last_reviewed timestamptz,
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
        CREATE TABLE IF NOT EXISTS current_position (
          id boolean PRIMARY KEY DEFAULT true, unit_id uuid, section_id uuid,
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT current_position_singleton CHECK (id)
        );
        CREATE TABLE IF NOT EXISTS daily_word_quota (day date PRIMARY KEY, available int NOT NULL);
        CREATE TABLE IF NOT EXISTS daily_session_log (
          day date PRIMARY KEY, new_seen int NOT NULL DEFAULT 0, reviews_completed int NOT NULL DEFAULT 0,
          correct int NOT NULL DEFAULT 0, wrong int NOT NULL DEFAULT 0
        );
      `);
    })();
  }
  return _ready;
}

// ---- raw row shape returned by the card-selection queries (pre-hydration) ----
interface RawCardRow {
  card_id: string; card_type: CardType; section_id: string | null; status: string;
  stage: number; in_a_row: number; wrong_streak: boolean;
  next_due: string | null; last_reviewed: string | Date | null;
}

/** Fetch the content for a batch of raw card rows and assemble full Card objects. */
async function hydrate(rows: RawCardRow[]): Promise<Card[]> {
  if (!rows.length) return [];
  const pool = await getPool();
  const tenseIds = rows.filter((r) => r.card_type === "tense_id").map((r) => r.card_id);
  const wordCardIds = rows.filter((r) => r.card_type === "word_id").map((r) => r.card_id);
  const noteIds = rows.filter((r) => r.card_type === "note_id").map((r) => r.card_id);

  // conjugations (by tense_id) → also reveals the underlying verb's word_id
  const conjMap = new Map<string, { word_id: string; tense: string; yo: string | null; tu: string | null; el: string | null; nosotros: string | null; ellos: string | null }>();
  if (tenseIds.length) {
    const r = await pool.query(
      `SELECT tense_id, word_id, tense, yo, tu, el, nosotros, ellos
         FROM verb_conjugations WHERE tense_id = ANY($1::uuid[])`,
      [tenseIds]
    );
    for (const c of r.rows) conjMap.set(c.tense_id, c);
  }

  // every word we need: direct word cards + the verbs behind tense cards
  const wordIds = new Set<string>(wordCardIds);
  for (const c of conjMap.values()) wordIds.add(c.word_id);
  const wordMap = new Map<string, Word>();
  const exByWord = new Map<string, Example[]>();
  if (wordIds.size) {
    const ids = [...wordIds];
    const w = await pool.query(
      `SELECT word_id, type, en, es, gender FROM vocab WHERE word_id = ANY($1::uuid[])`, [ids]
    );
    for (const row of w.rows) wordMap.set(row.word_id, { wordId: row.word_id, type: row.type, en: row.en, es: row.es, gender: row.gender });
    const ex = await pool.query(
      `SELECT example_id, word_id, example_en, example_es FROM examples
        WHERE word_id = ANY($1::uuid[]) ORDER BY word_id, example_id`, [ids]
    );
    for (const e of ex.rows) {
      if (!exByWord.has(e.word_id)) exByWord.set(e.word_id, []);
      exByWord.get(e.word_id)!.push({ exampleId: e.example_id, exampleEn: e.example_en, exampleEs: e.example_es });
    }
  }

  // notes (by note_id)
  const noteMap = new Map<string, Note>();
  if (noteIds.length) {
    const n = await pool.query(
      `SELECT note_id, note_prompt, note_answer FROM notes WHERE note_id = ANY($1::uuid[])`, [noteIds]
    );
    for (const x of n.rows) noteMap.set(x.note_id, { noteId: x.note_id, notePrompt: x.note_prompt, noteAnswer: x.note_answer });
  }

  return rows.map((r) => {
    const card: Card = {
      info: { cardId: r.card_id, cardType: r.card_type, section: r.section_id, status: r.status },
      stats: { stage: r.stage, inARow: r.in_a_row, wrongStreak: r.wrong_streak, nextDue: r.next_due, lastReviewed: isoOrNull(r.last_reviewed) },
    };
    if (r.card_type === "tense_id") {
      const c = conjMap.get(r.card_id);
      if (c) {
        card.conjugation = { tense: c.tense, yo: c.yo, tu: c.tu, el: c.el, nosotros: c.nosotros, ellos: c.ellos };
        const w = wordMap.get(c.word_id);
        if (w) card.word = w;
        card.examples = exByWord.get(c.word_id) ?? [];
      }
    } else if (r.card_type === "word_id") {
      const w = wordMap.get(r.card_id);
      if (w) card.word = w;
      card.examples = exByWord.get(r.card_id) ?? [];
    } else {
      const n = noteMap.get(r.card_id);
      if (n) card.note = n;
    }
    return card;
  });
}

/** Today's reviews: every started card whose next_due has arrived. */
export async function getReviewCards(): Promise<Card[]> {
  await ensureSchema();
  const pool = await getPool();
  const r = await pool.query<RawCardRow>(
    `SELECT card_id, card_type, section_id, status, stage, in_a_row, wrong_streak,
            to_char(next_due, 'YYYY-MM-DD') AS next_due, last_reviewed
       FROM section_anki_cards
      WHERE next_due IS NOT NULL AND next_due <= $1
      ORDER BY next_due, stage`,
    [today()]
  );
  return hydrate(r.rows);
}

/** New cards handed out per session pull. */
export const NEW_PULL = 40;
/** Fewer than this many unstarted cards left in the current frontier → unlock next section. */
export const SECTION_UNLOCK_THRESHOLD = 10;
/** Max "I don't know" new words per day (the per-day starting value of daily_word_quota.available). */
export const DAILY_NEW_LIMIT = 20;

/** Today's remaining "I don't know" allowance (daily_word_quota.available; full if no row yet). */
export async function dailyAvailable(): Promise<number> {
  await ensureSchema();
  const pool = await getPool();
  const r = await pool.query<{ available: number }>(
    `SELECT available FROM daily_word_quota WHERE day = $1`, [today()]
  );
  return r.rows[0]?.available ?? DAILY_NEW_LIMIT;
}

/** Highest deck ord that belongs to a section (its share of the deck). */
async function sectionMaxOrd(sectionId: string): Promise<number | null> {
  const pool = await getPool();
  const r = await pool.query<{ m: number | null }>(
    `SELECT max(ord) AS m FROM card_deck WHERE section_id = $1`, [sectionId]
  );
  return r.rows[0]?.m ?? null;
}

/** The next section after `sectionId` in unit/section order, or null at the end. */
async function nextSectionAfter(sectionId: string): Promise<{ unit_id: string; section_id: string } | null> {
  const pool = await getPool();
  const r = await pool.query<{ unit_id: string; section_id: string }>(
    `SELECT s2.unit_id, s2.section_id
       FROM sections s1 JOIN units u1 ON u1.unit_id = s1.unit_id
       CROSS JOIN sections s2 JOIN units u2 ON u2.unit_id = s2.unit_id
      WHERE s1.section_id = $1 AND (u2.ord, s2.ord) > (u1.ord, s1.ord)
      ORDER BY u2.ord, s2.ord LIMIT 1`,
    [sectionId]
  );
  return r.rows[0] ?? null;
}

/** Count of unstarted deck cards at or below a deck ord (the unlocked frontier). */
async function unstartedUpTo(maxOrd: number): Promise<number> {
  const pool = await getPool();
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM card_deck d
       LEFT JOIN section_anki_cards sac ON sac.card_type = d.card_type AND sac.card_id = d.card_id
      WHERE d.ord <= $1 AND sac.card_id IS NULL`, [maxOrd]
  );
  return r.rows[0]?.n ?? 0;
}

/**
 * The next `limit` brand-new cards, in textbook order, gated to the unlocked frontier:
 * cards from the master deck (card_deck) up to the current section's deck ord that
 * haven't been started yet. When fewer than SECTION_UNLOCK_THRESHOLD unstarted cards
 * remain in the frontier, current_position advances to unlock the next section.
 * Returns nothing once today's daily_word_quota.available is exhausted.
 *
 * Because card_deck is globally ordered by the curriculum, a tense card can never
 * surface before its unit — no preterite while you're still in Unit 1.
 */
/** Resolve the unlocked frontier, advancing current_position while it's too thin; returns its max deck ord. */
async function resolveFrontier(): Promise<number | null> {
  const pos = await getCurrentPosition();
  if (!pos.sectionId) return null;
  let sectionId = pos.sectionId;
  for (let i = 0; i < 500; i++) {
    const frontier = await sectionMaxOrd(sectionId);
    const remaining = frontier == null ? 0 : await unstartedUpTo(frontier);
    if (frontier != null && remaining >= SECTION_UNLOCK_THRESHOLD) break;
    const next = await nextSectionAfter(sectionId);
    if (!next) break;
    await setCurrentPosition(next.unit_id, next.section_id);
    sectionId = next.section_id;
  }
  return sectionMaxOrd(sectionId);
}

export async function getNewCards(limit = NEW_PULL): Promise<Card[]> {
  await ensureSchema();
  const pool = await getPool();
  if ((await dailyAvailable()) <= 0) return []; // daily "I don't know" ceiling hit
  const maxOrd = await resolveFrontier();
  if (maxOrd == null) return [];
  const r = await pool.query<RawCardRow>(
    `SELECT d.card_id, d.card_type, d.section_id, 'new'::text AS status,
            0 AS stage, 0 AS in_a_row, false AS wrong_streak,
            NULL::text AS next_due, NULL::timestamptz AS last_reviewed
       FROM card_deck d
       LEFT JOIN section_anki_cards sac ON sac.card_type = d.card_type AND sac.card_id = d.card_id
      WHERE d.ord <= $1 AND sac.card_id IS NULL
      ORDER BY d.ord
      LIMIT $2`,
    [maxOrd, limit]
  );
  return hydrate(r.rows);
}

/** How many new cards can still be started now (frontier ∩ unstarted); 0 if today's quota is spent. */
export async function availableNewCount(): Promise<number> {
  await ensureSchema();
  if ((await dailyAvailable()) <= 0) return 0;
  const maxOrd = await resolveFrontier();
  return maxOrd == null ? 0 : unstartedUpTo(maxOrd);
}

/** Lightweight list of every started card (stage + name) for the overview table. */
export async function getKnownCards(): Promise<CardSummary[]> {
  await ensureSchema();
  const pool = await getPool();
  const r = await pool.query(
    `SELECT sac.card_id, sac.card_type, sac.section_id, sac.status, sac.stage,
            to_char(sac.next_due, 'YYYY-MM-DD') AS next_due, sac.last_reviewed,
            COALESCE(v.es, vv.es, n.note_prompt) AS name,
            COALESCE(v.en, vv.en)               AS en,
            COALESCE(v.type, vv.type)           AS word_type,
            vc.tense                            AS tense
       FROM section_anki_cards sac
       LEFT JOIN vocab v              ON sac.card_type = 'word_id'  AND v.word_id = sac.card_id
       LEFT JOIN verb_conjugations vc ON sac.card_type = 'tense_id' AND vc.tense_id = sac.card_id
       LEFT JOIN vocab vv             ON sac.card_type = 'tense_id' AND vv.word_id = vc.word_id
       LEFT JOIN notes n              ON sac.card_type = 'note_id'  AND n.note_id = sac.card_id
      ORDER BY sac.stage DESC, name`
  );
  return r.rows.map((row) => ({
    cardId: row.card_id, cardType: row.card_type as CardType,
    name: row.name ?? "—", en: row.en, wordType: row.word_type, tense: row.tense,
    section: row.section_id, stage: row.stage, status: row.status,
    nextDue: row.next_due, lastReviewed: isoOrNull(row.last_reviewed),
  }));
}

// ---- current position (which unit/section the learner is on) ----

/** The learner's current position; defaults to the first section if none set. */
export async function getCurrentPosition(): Promise<Position> {
  await ensureSchema();
  const pool = await getPool();
  const r = await pool.query<Position & { unit_id: string; section_id: string }>(
    `SELECT unit_id, section_id FROM current_position WHERE id = true`
  );
  if (r.rows[0]?.section_id) return { unitId: r.rows[0].unit_id, sectionId: r.rows[0].section_id };
  const d = await pool.query<{ unit_id: string; section_id: string }>(
    `SELECT s.unit_id, s.section_id FROM sections s JOIN units u ON u.unit_id = s.unit_id
      ORDER BY u.ord, s.ord LIMIT 1`
  );
  return { unitId: d.rows[0]?.unit_id ?? null, sectionId: d.rows[0]?.section_id ?? null };
}

/** Move the learner to a unit/section. */
export async function setCurrentPosition(unitId: string, sectionId: string): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  await pool.query(
    `INSERT INTO current_position (id, unit_id, section_id, updated_at) VALUES (true, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET unit_id = EXCLUDED.unit_id, section_id = EXCLUDED.section_id, updated_at = now()`,
    [unitId, sectionId]
  );
}

// ============================================================================
// Grading — applies one answer to a card and persists the result.
//
// streakNeeded(stage): 3 at stage ≤1, 2 at stage 2/4, 1 at stage ≥8.
// due interval (days) = the resulting stage (stage 2 → +2d, …); 0 = today.
// stage ladder 1→2→4→8→16…; demote = floor(stage/2), floored at 1.
// ============================================================================

export type Rating = "dont_know" | "know" | "really_know";

export interface GradeResult {
  cardType: CardType;
  cardId: string;
  stage: number;
  inARow: number;
  wrongStreak: boolean;
  incorrectThisSession: boolean;
  nextDue: string;     // YYYY-MM-DD
  completed: boolean;  // left the review list on this answer?
  outcome: string;     // new_incorrect|new_dont_know|new_know|new_really_know|wrong|progress|boost|hold|demote
  countedNew: boolean; // consumed one of today's "I don't know" allowance
}

const streakNeededFor = (stage: number): number => (stage <= 1 ? 3 : stage <= 4 ? 2 : 1);
const dueDate = (days: number): string => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// ---- the four NEW-card outcomes (pure). All set status→review, wrong_streak=false. ----
interface NewOutcome { stage: number; inARow: number; incorrectSession: boolean; dueDays: number; counts: boolean; outcome: string }
const newIncorrect = (): NewOutcome => ({ stage: 1, inARow: 0, incorrectSession: true, dueDays: 0, counts: true, outcome: "new_incorrect" });
const newDontKnow = (): NewOutcome => ({ stage: 1, inARow: 1, incorrectSession: false, dueDays: 0, counts: true, outcome: "new_dont_know" });
const newKnow = (): NewOutcome => ({ stage: 4, inARow: 0, incorrectSession: false, dueDays: 4, counts: false, outcome: "new_know" });
const newReallyKnow = (): NewOutcome => ({ stage: 8, inARow: 0, incorrectSession: false, dueDays: 8, counts: false, outcome: "new_really_know" });

/** Decrement today's "I don't know" allowance (starts the day at DAILY_NEW_LIMIT). */
async function consumeDailyQuota(): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO daily_word_quota (day, available) VALUES ($1, $2)
     ON CONFLICT (day) DO UPDATE SET available = daily_word_quota.available - 1`,
    [today(), DAILY_NEW_LIMIT - 1]
  );
}

/** Accumulate today's session tally (for the end-of-session summary). */
async function logSession(d: { newSeen?: number; reviewsCompleted?: number; correct?: number; wrong?: number }): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO daily_session_log (day, new_seen, reviews_completed, correct, wrong) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (day) DO UPDATE SET
       new_seen = daily_session_log.new_seen + EXCLUDED.new_seen,
       reviews_completed = daily_session_log.reviews_completed + EXCLUDED.reviews_completed,
       correct = daily_session_log.correct + EXCLUDED.correct,
       wrong = daily_session_log.wrong + EXCLUDED.wrong`,
    [today(), d.newSeen ?? 0, d.reviewsCompleted ?? 0, d.correct ?? 0, d.wrong ?? 0]
  );
}

/**
 * Orchestrator for a NEW card's first sight. `correct=false` forces "I don't know";
 * a correct answer carries the learner's self-rating. know/really_know schedule the
 * card straight out; dont_know/incorrect drop it into today's review list to drill.
 */
export async function updateNewCard(
  cardType: CardType, cardId: string, answer: { correct: boolean; rating?: Rating }
): Promise<GradeResult> {
  await ensureSchema();
  const pool = await getPool();
  const o = !answer.correct ? newIncorrect()
    : answer.rating === "know" ? newKnow()
    : answer.rating === "really_know" ? newReallyKnow()
    : newDontKnow();

  const deck = (await pool.query<{ section_id: string | null; ord: number | null }>(
    `SELECT section_id, ord FROM card_deck WHERE card_type = $1 AND card_id = $2`, [cardType, cardId]
  )).rows[0];
  const due = dueDate(o.dueDays);
  await pool.query(
    `INSERT INTO section_anki_cards
       (card_id, card_type, section_id, ord, status, stage, in_a_row, wrong_streak, incorrect_this_session, next_due, last_reviewed)
     VALUES ($1,$2,$3,$4,'review',$5,$6,false,$7,$8, now())
     ON CONFLICT (card_type, card_id) DO UPDATE SET
       status='review', stage=EXCLUDED.stage, in_a_row=EXCLUDED.in_a_row, wrong_streak=false,
       incorrect_this_session=EXCLUDED.incorrect_this_session, next_due=EXCLUDED.next_due, last_reviewed=now(),
       section_id=COALESCE(section_anki_cards.section_id, EXCLUDED.section_id),
       ord=COALESCE(section_anki_cards.ord, EXCLUDED.ord)`,
    [cardId, cardType, deck?.section_id ?? null, deck?.ord ?? null, o.stage, o.inARow, o.incorrectSession, due]
  );
  if (o.counts) await consumeDailyQuota();
  await logSession({ newSeen: 1, correct: answer.correct ? 1 : 0, wrong: answer.correct ? 0 : 1 });

  return {
    cardType, cardId, stage: o.stage, inARow: o.inARow, wrongStreak: false,
    incorrectThisSession: o.incorrectSession, nextDue: due,
    completed: o.dueDays > 0, // know/really_know leave now; dont_know/incorrect stay to drill
    outcome: o.outcome, countedNew: o.counts,
  };
}

// ---- review-completion transitions (pure) ----
interface Transition { stage: number; wrongStreak: boolean; dueDays: number; outcome: string }
const boost = (stage: number): Transition => ({ stage: stage * 2, wrongStreak: false, dueDays: stage * 2, outcome: "boost" });
const hold = (stage: number): Transition => ({ stage, wrongStreak: true, dueDays: stage, outcome: "hold" });
const demote = (stage: number): Transition => {
  const ns = Math.max(1, Math.floor(stage / 2));
  return { stage: ns, wrongStreak: ns !== 1, dueDays: ns, outcome: "demote" };
};
/** Pick the completion transition from the session flags. */
function reviewTransition(stage: number, incorrectSession: boolean, wrongStreak: boolean): Transition {
  if (!incorrectSession) return boost(stage);   // clean session → advance, clear penalty
  if (!wrongStreak) return hold(stage);          // first bad session → hold, arm penalty
  return demote(stage);                          // second bad session → drop a rung
}

/**
 * Orchestrator for a REVIEW card. A wrong answer resets the in-a-row and marks the
 * session dirty (stays due today). A correct answer increments the in-a-row; once it
 * reaches streakNeeded(stage) the card completes — boost/hold/demote — leaves the
 * review list, and its session counters reset.
 */
export async function updateReviewCard(cardType: CardType, cardId: string, correct: boolean): Promise<GradeResult> {
  await ensureSchema();
  const pool = await getPool();
  const cur = (await pool.query<{ stage: number; in_a_row: number; wrong_streak: boolean; incorrect_this_session: boolean }>(
    `SELECT stage, in_a_row, wrong_streak, incorrect_this_session FROM section_anki_cards WHERE card_type=$1 AND card_id=$2`,
    [cardType, cardId]
  )).rows[0];
  if (!cur) throw new Error(`review card not found: ${cardType}:${cardId}`);

  if (!correct) {
    const due = dueDate(0);
    await pool.query(
      `UPDATE section_anki_cards SET in_a_row=0, incorrect_this_session=true, next_due=$3, last_reviewed=now()
        WHERE card_type=$1 AND card_id=$2`, [cardType, cardId, due]
    );
    await logSession({ wrong: 1 });
    return { cardType, cardId, stage: cur.stage, inARow: 0, wrongStreak: cur.wrong_streak, incorrectThisSession: true, nextDue: due, completed: false, outcome: "wrong", countedNew: false };
  }

  const inARow = cur.in_a_row + 1;
  if (inARow < streakNeededFor(cur.stage)) {
    const due = dueDate(0); // still owed → stays due today
    await pool.query(
      `UPDATE section_anki_cards SET in_a_row=$3, next_due=$4, last_reviewed=now() WHERE card_type=$1 AND card_id=$2`,
      [cardType, cardId, inARow, due]
    );
    await logSession({ correct: 1 });
    return { cardType, cardId, stage: cur.stage, inARow, wrongStreak: cur.wrong_streak, incorrectThisSession: cur.incorrect_this_session, nextDue: due, completed: false, outcome: "progress", countedNew: false };
  }

  // completed this session → transition out
  const t = reviewTransition(cur.stage, cur.incorrect_this_session, cur.wrong_streak);
  const due = dueDate(t.dueDays);
  await pool.query(
    `UPDATE section_anki_cards SET stage=$3, wrong_streak=$4, incorrect_this_session=false, in_a_row=0, next_due=$5, last_reviewed=now()
      WHERE card_type=$1 AND card_id=$2`,
    [cardType, cardId, t.stage, t.wrongStreak, due]
  );
  await logSession({ correct: 1, reviewsCompleted: 1 });
  return { cardType, cardId, stage: t.stage, inARow: 0, wrongStreak: t.wrongStreak, incorrectThisSession: false, nextDue: due, completed: true, outcome: t.outcome, countedNew: false };
}

/** Dispatch one answer to the right orchestrator based on the card's current status. */
export async function gradeCard(
  cardType: CardType, cardId: string, answer: { status: string; correct: boolean; rating?: Rating }
): Promise<GradeResult> {
  return answer.status === "new"
    ? updateNewCard(cardType, cardId, { correct: answer.correct, rating: answer.rating })
    : updateReviewCard(cardType, cardId, answer.correct);
}

// ============================================================================
// Session status — end-of-session summary + the lock-until-tomorrow signal.
// ============================================================================

export interface SessionSummary {
  /** True when there's nothing left to study today (no due reviews + no new cards available). */
  locked: boolean;
  dueCount: number;          // reviews still due right now
  newAvailable: number;      // new cards still grantable today (frontier ∩ unstarted, gated by quota)
  dailyNewRemaining: number; // daily_word_quota.available
  // today's tally (daily_session_log)
  newSeen: number;
  reviewsCompleted: number;
  correct: number;
  wrong: number;
  accuracy: number | null;   // % correct of answered, null if nothing answered
}

/** End-of-session summary + whether the learner is locked out until tomorrow. */
export async function getSessionSummary(): Promise<SessionSummary> {
  await ensureSchema();
  const pool = await getPool();
  const day = today();

  const dueCount = (await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM section_anki_cards WHERE next_due IS NOT NULL AND next_due <= $1`, [day]
  )).rows[0].n;
  const dailyNewRemaining = await dailyAvailable();
  const newAvailable = await availableNewCount();

  const log = (await pool.query<{ new_seen: number; reviews_completed: number; correct: number; wrong: number }>(
    `SELECT new_seen, reviews_completed, correct, wrong FROM daily_session_log WHERE day = $1`, [day]
  )).rows[0] ?? { new_seen: 0, reviews_completed: 0, correct: 0, wrong: 0 };
  const answered = log.correct + log.wrong;

  return {
    locked: dueCount === 0 && newAvailable === 0,
    dueCount, newAvailable, dailyNewRemaining,
    newSeen: log.new_seen, reviewsCompleted: log.reviews_completed, correct: log.correct, wrong: log.wrong,
    accuracy: answered ? Math.round((log.correct / answered) * 100) : null,
  };
}
