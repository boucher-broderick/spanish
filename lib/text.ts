// Answer-comparison helpers.

// Lowercase, trim, collapse spaces.
function basicNorm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

// Strip diacritics (for accent-tolerant matching).
export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Accent-TOLERANT equality (used by most exercises): ignores accents and case.
export function matchesLoose(input: string, target: string): boolean {
  return foldAccents(basicNorm(input)) === foldAccents(basicNorm(target));
}

// Accent-SENSITIVE equality (used by Spelling): accents must match exactly.
export function matchesStrict(input: string, target: string): boolean {
  return basicNorm(input) === basicNorm(target);
}

// True if the input is correct but only differs by missing/extra accents.
export function accentOnlyMiss(input: string, target: string): boolean {
  return !matchesStrict(input, target) && matchesLoose(input, target);
}
