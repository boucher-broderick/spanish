// Spanish clock times. Hours are 1–12, minutes 0–59 (any minute, not just 5s).
//
// NUMBER mode (clock shown): accept BOTH the numeric form ("son las tres y
// cuarenta y cinco") and the traditional form ("son las cuatro menos cuarto").
// ENGLISH-WORDS mode (English phrase shown): require the one specific traditional
// Spanish form that matches the phrase.
import { numberToSpanish } from "./numbers";

export interface ClockTime {
  hour: number; // 1–12
  minute: number; // 0–59
}

// "es la una" for 1 o'clock, otherwise "son las <hour>".
function base(hour: number): string {
  return hour === 1 ? "es la una" : `son las ${numberToSpanish(hour)}`;
}
function nextHour(hour: number): number {
  return (hour % 12) + 1;
}

// The single canonical traditional phrasing (cuarto / media / menos / en punto).
export function timeCanonical({ hour, minute }: ClockTime): string {
  const b = base(hour);
  const nb = base(nextHour(hour));
  if (minute === 0) return `${b} en punto`;
  if (minute === 15) return `${b} y cuarto`;
  if (minute === 30) return `${b} y media`;
  if (minute === 45) return `${nb} menos cuarto`;
  if (minute < 30) return `${b} y ${numberToSpanish(minute)}`;
  return `${nb} menos ${numberToSpanish(60 - minute)}`;
}

// Every form accepted in NUMBER mode (numeric + traditional, de-duped).
export function acceptedTimeAnswers({ hour, minute }: ClockTime): string[] {
  const b = base(hour);
  const numeric = minute === 0 ? b : `${b} y ${numberToSpanish(minute)}`;
  const out = new Set<string>([numeric, timeCanonical({ hour, minute })]);
  if (minute === 0) out.add(b); // "son las dos" as well as "son las dos en punto"
  return [...out];
}

// English word numbers 0–59, for the ENGLISH-WORDS prompt.
const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
function englishNumber(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? EN_TENS[t] : `${EN_TENS[t]}-${EN_ONES[u]}`;
}

// English phrase shown in ENGLISH-WORDS mode, e.g. "half past five",
// "quarter to six", "twenty-three minutes to six", "five o'clock".
export function englishTimePhrase({ hour, minute }: ClockTime): string {
  const h = englishNumber(hour);
  const next = englishNumber(nextHour(hour));
  if (minute === 0) return `${h} o'clock`;
  if (minute === 15) return `quarter past ${h}`;
  if (minute === 30) return `half past ${h}`;
  if (minute === 45) return `quarter to ${next}`;
  if (minute < 30) return `${englishNumber(minute)} minutes past ${h}`;
  return `${englishNumber(60 - minute)} minutes to ${next}`;
}
