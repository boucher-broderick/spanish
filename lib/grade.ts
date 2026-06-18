// Exact-match grading for workbook blanks. No LLM — pure normalized string
// comparison. Spanish accents and ñ are meaningful (compro != compró), so they
// are preserved; only case, surrounding whitespace, punctuation, and collapsible
// inner spaces are normalized away.

/** Normalize an answer for comparison: lowercase, collapse inner whitespace,
 *  strip surrounding punctuation/quotes. Accents and ñ are kept. */
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    // strip leading/trailing punctuation the book is inconsistent about
    .replace(/^[¿¡"'(\[]+/u, "")
    .replace(/[.,;:!?"')\]]+$/u, "")
    .trim();
}

export type Verdict = "correct" | "incorrect" | "empty";

/** Grade a user's input against the list of acceptable answers. */
export function grade(input: string, answers: string[]): Verdict {
  if (!input.trim()) return "empty";
  if (!answers || answers.length === 0) return "empty"; // nothing to grade against
  const got = normalize(input);
  return answers.some((a) => normalize(a) === got) ? "correct" : "incorrect";
}
