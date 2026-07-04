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

/** Conjugation shape (subset) needed to build the spoken full-tense recitation. */
export interface AudioConjugation {
  yo: string | null; tu: string | null; el: string | null;
  nosotros: string | null; ellos: string | null;
}

/**
 * One spoken recitation of a whole tense: each non-null form prefixed by a plain
 * pronoun, joined by commas so TTS reads them with natural pauses — e.g.
 * "yo hablo, tú hablas, él habla, nosotros hablamos, ellos hablan". Returns "" if
 * the tense has no forms.
 */
export function conjugationsAudioText(c: AudioConjugation): string {
  const forms: [string, string | null][] = [
    ["yo", c.yo], ["tú", c.tu], ["él", c.el], ["nosotros", c.nosotros], ["ellos", c.ellos],
  ];
  return forms.filter(([, v]) => v && v.trim()).map(([p, v]) => `${p} ${v!.trim()}`).join(", ");
}

/** Card shape (subset) for collecting a card's pre-warm texts. */
export interface AudioCard {
  info: { cardType: "word_id" | "tense_id" | "note_id" };
  word?: { audioEs: string };
  conjugation?: AudioConjugation;
}

/**
 * Every Spanish string worth pre-generating audio for on this card:
 *  - word cards  → the word (with article for nouns)
 *  - verb cards  → the infinitive + ONE clip reciting all conjugations
 *  - note cards  → none (lesson cards are excluded)
 */
export function audioTextsForCard(card: AudioCard): string[] {
  const out: string[] = [];
  if (card.info.cardType === "note_id") return out;
  if (card.word?.audioEs) out.push(card.word.audioEs);
  if (card.info.cardType === "tense_id" && card.conjugation) {
    const all = conjugationsAudioText(card.conjugation);
    if (all) out.push(all);
  }
  return out;
}
