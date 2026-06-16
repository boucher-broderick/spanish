// Loads the authored curriculum (data/curriculum.json) and resolves each lesson's
// words against the runtime word dataset. Mirrors lib/words.ts: the JSON is bundled
// and cached; lookups are cheap. Client+server-safe (no "server-only") — the file is
// small static reference data, so unlike words.json it does not go through /api.
import curriculumData from "@/data/curriculum.json";
import type { Curriculum, Lesson, ResolvedWord, Unit } from "./course";
import type { Category, Word } from "./domain";
import { wordById } from "./words";

const CURRICULUM = curriculumData as Curriculum;

export function getCurriculum(): Curriculum {
  return CURRICULUM;
}

export function getUnits(): Unit[] {
  return [...CURRICULUM.units].sort((a, b) => a.order - b.order);
}

export function getLesson(id: string): Lesson | undefined {
  return CURRICULUM.lessons[id];
}

export function getUnit(id: string): Unit | undefined {
  return CURRICULUM.units.find((u) => u.id === id);
}

// Ordered list of every lesson, following unit order then lesson order.
export function orderedLessons(): Lesson[] {
  const out: Lesson[] = [];
  for (const u of getUnits()) {
    for (const id of u.lessonIds) {
      const l = CURRICULUM.lessons[id];
      if (l) out.push(l);
    }
  }
  return out;
}

// The lesson immediately after the given one in course order (or undefined).
export function nextLesson(id: string): Lesson | undefined {
  const all = orderedLessons();
  const i = all.findIndex((l) => l.id === id);
  return i >= 0 ? all[i + 1] : undefined;
}

// Word ids that exist in the dataset (used by Play / vocab selection).
export function lessonWordIds(lesson: Lesson): string[] {
  return lesson.words.filter((w) => w.wordId).map((w) => w.wordId!);
}

// Derive a part-of-speech from a dataset word id ("verb-ser" -> "verb"), used when
// the runtime word array isn't populated (e.g. server-side gate computation).
function posFromId(id: string): string {
  return id.split("-")[0] || "other";
}

// Resolve a lesson's words into a uniform shape. Dataset words are looked up by id
// (falling back to id-derived pos when WORDS isn't loaded); inline words keep their
// authored fields and get a synthetic, stable id so they still key into
// ProgressState.words and can be injected into a Play pool.
export function resolveLessonWords(lesson: Lesson): ResolvedWord[] {
  return lesson.words.map((lw, i) => {
    if (lw.wordId) {
      const w = wordById(lw.wordId);
      if (w) {
        return {
          id: w.id,
          spanish: w.spanish,
          english: w.english,
          lemma: w.lemma,
          pos: w.pos,
          inDataset: true,
        };
      }
      // Dataset not loaded (server) — derive what we can from the id.
      return {
        id: lw.wordId,
        spanish: lw.wordId,
        english: lw.wordId,
        lemma: lw.wordId,
        pos: posFromId(lw.wordId),
        inDataset: true,
      };
    }
    return {
      id: `lesson:${lesson.id}:${i}`,
      spanish: lw.spanish ?? "",
      english: lw.english ?? "",
      lemma: lw.lemma ?? lw.spanish ?? "",
      pos: lw.pos ?? "other",
      inDataset: false,
    };
  });
}

// Which mastery exercise gates a given word: verbs -> conjugation, everything else
// -> spelling (matches GROUP_MAIN_GAME in lib/domain.ts but works from pos alone, so
// it covers inline words and server-side use where Category isn't available).
export function gateExerciseForPos(pos: string): "conjugation" | "spelling" {
  return pos === "verb" ? "conjugation" : "spelling";
}

const POS_TO_CATEGORY: Record<string, Category> = {
  noun: "Nouns",
  verb: "Verbs",
  adjective: "Adjectives",
  adverb: "Adverbs",
  pronoun: "Pronouns",
  preposition: "Prepositions",
  conjunction: "Conjunctions",
  interjection: "Interjections",
};

function articleOf(spanish: string): string | null {
  const m = /^(el|la|los|las)\s+/i.exec(spanish);
  return m ? m[1].toLowerCase() : null;
}

// Build a full Word for one resolved lesson word — the real dataset entry when
// available, otherwise a synthetic one so inline words can drive the Play exercises.
function toPlayWord(rw: ResolvedWord): Word {
  if (rw.inDataset) {
    const real = wordById(rw.id);
    if (real) return real;
  }
  const verbGroup = rw.pos === "verb" ? (rw.lemma.slice(-2) as Word["verbGroup"]) : null;
  return {
    id: rw.id,
    rank: 0,
    categoryRank: 0,
    category: POS_TO_CATEGORY[rw.pos] ?? "Nouns",
    pos: rw.pos,
    spanish: rw.spanish,
    english: rw.english,
    lemma: rw.lemma,
    article: rw.pos === "noun" ? articleOf(rw.spanish) : null,
    gender: null,
    verbGroup: verbGroup === "ar" || verbGroup === "er" || verbGroup === "ir" ? verbGroup : null,
  };
}

// The lesson's words playable in a given gate exercise (verbs -> conjugation,
// the rest -> spelling). Used to launch a lesson-scoped Play session.
export function lessonPlayPool(lesson: Lesson, exercise: "conjugation" | "spelling"): Word[] {
  return resolveLessonWords(lesson)
    .filter((w) => (exercise === "conjugation" ? w.pos === "verb" : w.pos !== "verb"))
    .map(toPlayWord);
}
