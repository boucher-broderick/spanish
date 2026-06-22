# Learning System — Data Model & SRS Reference

This documents the table structure, columns, and data shapes currently in place for
the Anki-style spaced-repetition trainer. There are **two independent database
layers**, split on purpose so re-seeding vocabulary never wipes a learner's
progress (the SRS tables have **no foreign keys** into vocab).

- **Content** layer — static curriculum, seeded from JSON. Idempotent; TRUNCATE + reload.
- **Progress** layer — per-user SRS state. Created lazily; never touched by the seed.
- A **legacy generic store** (`app_state`) survives untouched and is not used by the SRS.

---

## 1. Vocab CONTENT tables (Postgres)

Defined and seeded by `parser/seed_vocab_db.mjs` from `data/words.json`. Every
seed runs `CREATE TABLE IF NOT EXISTS`, then `TRUNCATE … RESTART IDENTITY CASCADE`
and reloads **only** these content tables.

```
DATABASE_URL=postgres://spanish:spanish@localhost:5433/spanish node parser/seed_vocab_db.mjs
```

### vocab — the de-duplicated word table (3,085 rows)
| column | type | notes |
|---|---|---|
| `id_word` | text PK | `{prefix}-{slug}` — e.g. `verb-comprar`, `adj-abierto` |
| `type` | text NOT NULL | `verb` \| `noun` \| `adjective` \| `adverb` \| `expression` |
| `es` | text NOT NULL | Spanish headword (may be `"famoso, famosa"`) |
| `en` | text NOT NULL | English gloss |
| `gender` | text | nouns only, when known |
| `yo` | text | irregular first-person, when stored |

Row counts by type: noun 1510, verb 666, adjective 346, expression 289, adverb 274.
Index: `idx_vocab_type` on `(type)`.

**`id_word` slug** = article-stripped, accents removed, masculine head of a
"masc, fem" pair, non-alphanumerics → `-`. The same verb appearing in 40 sections
collapses to ONE row.

### vocab_units — 26 units
| column | type | notes |
|---|---|---|
| `unit` | int PK | |
| `title` | text NOT NULL | |

### vocab_sections — 177 sections
| column | type | notes |
|---|---|---|
| `unit` | int | PK part |
| `section_idx` | int | PK part |
| `title` | text NOT NULL | |
| `page` | int | printed page |

PK `(unit, section_idx)`.

### vocab_section_words — section membership join (7,704 rows)
| column | type | notes |
|---|---|---|
| `unit` | int | PK part |
| `section_idx` | int | PK part |
| `word_id` | text | PK part, FK → vocab ON DELETE CASCADE |
| `pos` | text | PK part — **plural** form: `verbs`\|`nouns`\|`adjectives`\|`adverbs`\|`expressions` |
| `ord` | int NOT NULL | order within the section/pos list |

PK `(unit, section_idx, word_id, pos)`. Index `idx_secwords_loc` on `(unit, section_idx)`.

> Note: `vocab.type` is **singular** (`verb`), `vocab_section_words.pos` is **plural** (`verbs`).

### examples — 2 sentences per word
| column | type | notes |
|---|---|---|
| `id_example` | bigserial PK | |
| `word_id` | text NOT NULL | FK → vocab CASCADE |
| `idx` | int NOT NULL | 0-based order |
| `ex_es` | text NOT NULL | |
| `ex_en` | text NOT NULL | |
| `tense` | text | currently always null |

Sourced from two caches (verbs + non-verbs), see §4.

### verb_tenses — conjugation forms
| column | type | notes |
|---|---|---|
| `id_tense` | bigserial PK | |
| `word_id` | text NOT NULL | FK → vocab CASCADE |
| `tense` | text NOT NULL | `present`, `preterite`, `imperfect`, `future`, `conditional`, `present_subjunctive` |
| `yo` `tu` `el` `nosotros` `ellos` | text | **no `vosotros`** (5 persons) |

UNIQUE `(word_id, tense)`.

### flashcards — concept cards (259 rows)
| column | type | notes |
|---|---|---|
| `id_flashcard` | bigserial PK | |
| `unit` | int | |
| `section_idx` | int | |
| `kind` | text | `conjugation_rule` \| `usage` \| `idiom` |
| `prompt` | text | question side |
| `answer` | text | answer side |
| `tense` | text | nullable |

### curriculum — the introduction-order source of truth (4,844 rows)
**DROP/CREATEd fresh every seed** (no FK). Each row points to ONE of word / verb_tense / flashcard.
| column | type | notes |
|---|---|---|
| `id` | bigserial PK | |
| `unit` | int NOT NULL | |
| `order_index` | int NOT NULL | global ordering key (indexed) |
| `item_type` | text NOT NULL | `word` \| `verb_tense` \| `flashcard` |
| `word_id` | text | word + verb_tense rows → vocab.id_word |
| `tense` | text | verb_tense rows — stable tense name |
| `tense_id` | bigint | verb_tense rows → verb_tenses.id_tense |
| `flashcard_id` | bigint | flashcard rows → flashcards.id_flashcard |

Counts: 2,425 verb_tense, 2,419 word. Index `idx_curriculum_order` on `(order_index)`.

**Ordering rule** (built in `seed_vocab_db.mjs` + `normalize_vocab.mjs`): per unit,
concept flashcards come first (they explain the grammar), then vocab / verb-tense
in textbook reading order. Verbs are scheduled **per (verb, tense)** — introduced
in `present` at first appearance, then every previously-seen verb is re-added in
each new tense as it's unlocked:

| tense | introduced at unit |
|---|---|
| preterite | 4 |
| imperfect | 5 |
| future | 7 |
| conditional | 7 |
| present_subjunctive | 13 |

---

## 2. Per-user SRS PROGRESS tables (Postgres)

Created lazily by `ensureSchema()` in `lib/srs-store.ts`. **This is the actual
Anki state.** No FK to vocab — re-seeding content is safe.

### srs_progress
| column | type | notes |
|---|---|---|
| `user_id` | text | PK part |
| `card_type` | text | PK part — `word` \| `verb_tense` \| `flashcard` |
| `ref_id` | text | PK part — `id_word` \| `{id_word}:{tense}` \| flashcard id |
| `stage` | int DEFAULT 0 | doubling-ladder rung (= interval days); 0 = new |
| `wrong_streak` | int DEFAULT 0 | lives in {0,1,2} |
| `next_due` | date | |
| `last_reviewed` | timestamptz | |
| `status` | text DEFAULT 'new' | `new` \| `review` |

PK `(user_id, card_type, ref_id)`. Index `idx_srs_due` on `(user_id, next_due)`.

`cardKey` = `{card_type}:{ref_id}`.

### srs_daily_log — daily new-word quota
| column | type | notes |
|---|---|---|
| `user_id` | text | PK part |
| `day` | date | PK part |
| `new_words` | int DEFAULT 0 | counted against `DAILY_NEW_GOAL = 10` |

---

## 3. SRS scheduling model (pure engine — `lib/srs.ts`)

Side-effect-free (no dates, no I/O) so it's exhaustively unit-testable. The
session/route layer supplies "today" and persists to `srs_progress`.

- **stage**: doubling ladder `1,2,4,8,16,…` (interval in days). `0` = new/unseen.
- **wrongStreak**: count of review sessions with ≥1 miss; in `{0,1,2}`. Only ever
  changes at stage ≥ 2.
- **streak** (in-session only): correct answers in a row this session; resets to 0 on a miss.
- **streakNeeded(stage)**: reps-in-a-row to complete a card — stage 1→3, stages 2&4→2, stage 8+→1.

**Ratings**: `dont_know` \| `know` \| `really_know`.

First encounter:
| rating | lands at | drilled now? | interval |
|---|---|---|---|
| `really_know` | stage 8 | no | 8d |
| `know` | stage 4 | no | 4d |
| `dont_know` | stage 1 | yes (3-in-a-row) | 1d |

Review completion (`completeReview`): stage 1 always advances to 2; on error
`wrongStreak += 1` (==1 holds, ==2 demotes one rung & resets to 1); clean run with
`wrongStreak==0` advances one rung, otherwise clears the hold.

`completeCard` persistence kinds: `first` (new know/really_know, doesn't count
toward daily goal), `learn_start` (new "don't know" — stage 1, still due today,
counts toward daily 10), `learn_done` (finished 3-in-a-row → schedule +1 day),
`review` (already-seen; `erred` flag).

---

## 4. Source data files (feed the seed)

| file | shape | size |
|---|---|---|
| `data/vocab.json` | `{ units: [{ unit, title, sections: [{ title, page, verbs[], nouns[], … }] }] }` — raw textbook export, also the runtime fallback | — |
| `data/words.json` | `{ words[], units[], sections[], sectionWords[], curriculum[] }` — output of `normalize_vocab.mjs` | 3,085 words / 4,844 curriculum |
| `parser/cache/conjugations/verbs.json` | `{ wordId: { tense: {yo,tu,el,nosotros,ellos} } }` | 666 verbs |
| `parser/cache/examples/verbs.json` | `{ wordId: [{es,en}] }` | 666 verbs |
| `parser/cache/nonverb-examples/words.json` | `{ wordId: [{es,en}] }` | 268 words |
| `parser/cache/concepts/cards.json` | `[{unit, sectionIdx, kind, prompt, answer, tense}]` | 259 cards |

Pipeline: `data/vocab.json` → `normalize_vocab.mjs` → `data/words.json` +
caches → `seed_vocab_db.mjs` → Postgres content tables.

---

## 5. Runtime card shapes (TypeScript — `lib/srs-store.ts`)

Three variants assembled from the tables, unified as `StudyCard`:

- **SessionCard** (`type: "word"`) — `prompt` (en), `answer` (es), `gender`, `examples[]`, `stage`, `streakNeeded`.
- **VerbCard** (`type: "verb_tense"`) — `infinitive`, `en`, `tense`, `forms: {yo,tu,el,nosotros,ellos}`, `examples[]`.
- **FlashCard** (`type: "flashcard"`) — `kind`, `prompt`, `answer`, `tense`, `unit`.

`SessionPayload` (from `getSession`): `{ reviews[], newCards[], dailyNewDone,
dailyNewRemaining, dueCount }`. `OverviewPayload` (from `getOverview`): `{ upcoming[],
dueToday[], future[], dailyNewDone, dailyNewRemaining, upcomingTruncated }`.

API routes: `app/api/anki/{session,overview,complete}/route.ts`.

---

## 6. Legacy generic store (present, NOT used by SRS)

`lib/store.ts` — a single table **`app_state`** (`id` text PK, `data` jsonb,
`updated_at` timestamptz), with a `.data/state-*.json` file fallback when
`DATABASE_URL` is unset. The seed script comments also reference older `words` /
`progress` tables it deliberately never touches. The SRS system stores nothing here.
