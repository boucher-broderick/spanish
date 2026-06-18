// Practice question generators for the Numbers, Dates, and Time games.
// Pure client-usable logic built on the recovered Spanish generators.
import { numberToSpanish } from "@/lib/spanish/numbers";
import { dateToSpanish, dateToEnglish } from "@/lib/spanish/dates";
import { acceptedTimeAnswers, englishTimePhrase, type ClockTime } from "@/lib/spanish/time";

export interface Question {
  prompt: string;       // what we show (a number, English date, English time phrase)
  answers: string[];    // accepted Spanish answers
  promptKind?: "number" | "text";
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

export function numbersQuestion(max = 1000): Question {
  const n = randInt(0, max);
  return { prompt: String(n), answers: [numberToSpanish(n)], promptKind: "number" };
}

export function datesQuestion(): Question {
  // a random date within a wide window
  const base = Date.UTC(2000, 0, 1);
  const d = new Date(base + randInt(0, 9999) * 86400000);
  return { prompt: dateToEnglish(d), answers: [dateToSpanish(d)] };
}

const TIME_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
export function timeQuestion(): Question {
  const t: ClockTime = { hour: randInt(1, 12), minute: pick(TIME_MINUTES) };
  return { prompt: englishTimePhrase(t), answers: acceptedTimeAnswers(t) };
}

export type GameKind = "drill" | "llm";

// Deterministic drills have a `gen` (and support a listen mode). LLM games
// (Chat/Writing/Reading/Listening) are rendered by their own components and
// have no `gen`.
export interface Game {
  key: string;
  title: string;
  blurb: string;
  emoji: string;
  kind: GameKind;
  instruction?: string;
  gen?: () => Question;
  listen?: boolean; // drill supports a "hear it, write it" mode
}

export const GAMES: Record<string, Game> = {
  numbers: {
    key: "numbers",
    title: "Numbers",
    blurb: "Write Spanish numbers from 0 to 1000.",
    instruction: "Write this number in Spanish:",
    emoji: "🔢",
    kind: "drill",
    listen: true,
    gen: () => numbersQuestion(1000),
  },
  dates: {
    key: "dates",
    title: "Dates",
    blurb: "Say the day of the week and date in Spanish.",
    instruction: "Write this date in Spanish:",
    emoji: "📅",
    kind: "drill",
    listen: true,
    gen: datesQuestion,
  },
  time: {
    key: "time",
    title: "Time",
    blurb: "Tell the time in Spanish (traditional phrasing).",
    instruction: "Write this time in Spanish:",
    emoji: "🕐",
    kind: "drill",
    listen: true,
    gen: timeQuestion,
  },
  chat: {
    key: "chat",
    title: "Chat",
    blurb: "Converse in Spanish with an AI partner at your level.",
    emoji: "💬",
    kind: "llm",
  },
  writing: {
    key: "writing",
    title: "Writing",
    blurb: "Get a prompt, write, and have it graded with fixes.",
    emoji: "✍️",
    kind: "llm",
  },
  reading: {
    key: "reading",
    title: "Reading",
    blurb: "Read an AI-generated story and answer questions.",
    emoji: "📖",
    kind: "llm",
  },
  listening: {
    key: "listening",
    title: "Listening",
    blurb: "Hear a story read aloud, then transcribe or answer.",
    emoji: "🎧",
    kind: "llm",
  },
};

export const GAME_LIST = Object.values(GAMES);
