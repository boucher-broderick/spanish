// Parses words.txt (frequency-ordered, en-dash separated) into data/words.json.
// Run: node scripts/parse-words.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CATEGORIES = {
  Pronouns: "pronoun",
  Nouns: "noun",
  Adjectives: "adjective",
  Verbs: "verb",
  Adverbs: "adverb",
  Prepositions: "preposition",
  Conjunctions: "conjunction",
  Interjections: "interjection",
};

const SKIP_PREFIXES = ["Example", "Learn more", "•", "Common", "Examples", "Nouns are", "A pronoun"];

// Normalize a string into an ascii slug fragment.
function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Strip a leading article from a noun, returning {lemma, article, gender}.
function splitArticle(spanish) {
  const m = spanish.match(/^(el \/ la|el|la|los|las)\s+(.+)$/);
  if (!m) return { lemma: spanish, article: null, gender: null };
  const art = m[1];
  const gender =
    art === "el" ? "m" : art === "la" ? "f" : art === "los" ? "m" : art === "las" ? "f" : "mf";
  return { lemma: m[2], article: art, gender };
}

const raw = readFileSync(join(ROOT, "words.txt"), "utf8");
const lines = raw.split(/\r?\n/);

let currentCat = null;
const words = [];
const seen = new Set();
let globalRank = 0;
const catRank = {};

for (let line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // Category header?
  if (CATEGORIES[trimmed]) {
    currentCat = trimmed;
    catRank[currentCat] = 0;
    continue;
  }
  if (SKIP_PREFIXES.some((p) => trimmed.startsWith(p))) continue;

  // Word line must contain an en-dash separator.
  const idx = trimmed.indexOf("–");
  if (idx === -1) continue;
  if (!currentCat) continue;

  let spanish = trimmed.slice(0, idx).trim();
  let english = trimmed.slice(idx + 1).trim();
  // Strip "| learn more" trailer.
  english = english.replace(/\s*\|\s*learn more\s*$/i, "").trim();
  if (!spanish || !english) continue;

  const pos = CATEGORIES[currentCat];
  const key = `${pos}:${spanish.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);

  globalRank += 1;
  catRank[currentCat] += 1;

  const entry = {
    id: "",
    rank: globalRank,
    categoryRank: catRank[currentCat],
    category: currentCat,
    pos,
    spanish,
    english,
    lemma: spanish,
    article: null,
    gender: null,
    verbGroup: null,
  };

  if (pos === "noun") {
    const { lemma, article, gender } = splitArticle(spanish);
    entry.lemma = lemma;
    entry.article = article;
    entry.gender = gender;
  }

  if (pos === "verb") {
    const inf = spanish.toLowerCase();
    if (inf.endsWith("ar")) entry.verbGroup = "ar";
    else if (inf.endsWith("er")) entry.verbGroup = "er";
    else if (inf.endsWith("ir") || inf.endsWith("ír")) entry.verbGroup = "ir";
  }

  let base = `${pos}-${slugify(entry.lemma) || slugify(spanish) || "w"}`;
  let id = base;
  let n = 2;
  while (words.some((w) => w.id === id)) id = `${base}-${n++}`;
  entry.id = id;

  words.push(entry);
}

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "words.json"), JSON.stringify(words, null, 2) + "\n");

const byCat = {};
for (const w of words) byCat[w.category] = (byCat[w.category] || 0) + 1;
console.log(`Parsed ${words.length} words`);
console.log(byCat);
