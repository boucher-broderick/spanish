// Pure helpers deciding WHAT Spanish text gets spoken for a card. Kept free of
// server-only / DB imports so both the server (lib/cards.ts hydrate + the
// pre-warm endpoint) and the client (StudySession) can share one source of
// truth for the exact strings synthesized — no drift between what's generated
// and what the play button requests.

/** Minimal vocab shape needed to decide a noun's spoken form. */
export interface AudioWord {
  type: string;          // noun | verb | adjective | adverb | expression
  es: string;            // bare Spanish (e.g. "perro")
  gender: string | null; // "m" | "f" | "m/f" | null
}

/**
 * The Spanish text to speak for a vocab word. Nouns get their definite article
 * ("el perro" / "la casa"); everything else — verbs (infinitive), adjectives,
 * adverbs, expressions, and ambiguous (m/f) or unmarked nouns — is spoken bare.
 */
export function nounAudioEs(w: AudioWord): string {
  if (w.type === "noun") {
    if (w.gender === "m") return `el ${w.es}`;
    if (w.gender === "f") return `la ${w.es}`;
  }
  return w.es;
}

/** Card shape (subset) for collecting a card's pre-warm texts. */
export interface AudioCard {
  info: { cardType: "word_id" | "tense_id" | "note_id" };
  word?: { audioEs: string };
  conjugation?: {
    yo: string | null; tu: string | null; el: string | null;
    nosotros: string | null; ellos: string | null;
  };
}

/**
 * Every Spanish string worth pre-generating audio for on this card:
 *  - word cards  → the word (with article for nouns)
 *  - verb cards  → the infinitive + each non-null conjugated form
 *  - note cards  → none (lesson cards are excluded)
 */
export function audioTextsForCard(card: AudioCard): string[] {
  const out: string[] = [];
  if (card.info.cardType === "note_id") return out;
  if (card.word?.audioEs) out.push(card.word.audioEs);
  if (card.info.cardType === "tense_id" && card.conjugation) {
    const c = card.conjugation;
    for (const f of [c.yo, c.tu, c.el, c.nosotros, c.ellos]) {
      if (f && f.trim()) out.push(f);
    }
  }
  return out;
}
