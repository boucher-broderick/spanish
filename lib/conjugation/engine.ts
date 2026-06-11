// Spanish conjugation engine: regular rules + stem changes + orthographic fixes,
// with per-verb overrides from irregulars.ts. Covers all simple tenses.
import { Tense, Conjugation, VerbConfig } from "./types";
import { IRREGULARS } from "./irregulars";

const ACCENT: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };

function group(inf: string): "ar" | "er" | "ir" {
  if (inf.endsWith("ar")) return "ar";
  if (inf.endsWith("er")) return "er";
  return "ir"; // ir / ír
}
function stemOf(inf: string): string {
  return inf.slice(0, -2);
}
function endsVowel(s: string): boolean {
  return /[aeiouáéíóú]$/.test(s);
}

// Apply a boot stem change to the last source vowel of the stem.
function applyStemChange(stem: string, change: string): string {
  const [from, to] = change.split(":");
  const idx = stem.lastIndexOf(from);
  if (idx === -1) return stem;
  return stem.slice(0, idx) + to + stem.slice(idx + from.length);
}
// Secondary (unstressed) change used by -ir boot verbs in 3rd-person preterite,
// nosotros/vosotros subjunctive, and the imperfect subjunctive (derived).
function secondaryChange(stem: string, change?: string): string {
  if (change === "e:ie" || change === "e:i") {
    const idx = stem.lastIndexOf("e");
    if (idx !== -1) return stem.slice(0, idx) + "i" + stem.slice(idx + 1);
  }
  if (change === "o:ue") {
    const idx = stem.lastIndexOf("o");
    if (idx !== -1) return stem.slice(0, idx) + "u" + stem.slice(idx + 1);
  }
  return stem;
}
function accentLastVowel(base: string): string {
  for (let i = base.length - 1; i >= 0; i--) {
    if ("aeiou".includes(base[i])) return base.slice(0, i) + ACCENT[base[i]] + base.slice(i + 1);
  }
  return base;
}

// Fix c/g/z at the stem-ending boundary for -car/-gar/-zar verbs before e-endings.
function joinOrtho(inf: string, stem: string, ending: string): string {
  if (/^[eé]/.test(ending)) {
    if (inf.endsWith("car") && stem.endsWith("c")) stem = stem.slice(0, -1) + "qu";
    else if (inf.endsWith("gar") && stem.endsWith("g")) stem = stem.slice(0, -1) + "gu";
    else if (inf.endsWith("zar") && stem.endsWith("z")) stem = stem.slice(0, -1) + "c";
  }
  return stem + ending;
}

const END = {
  ar: {
    present: ["o", "as", "a", "amos", "áis", "an"],
    preterite: ["é", "aste", "ó", "amos", "asteis", "aron"],
    imperfect: ["aba", "abas", "aba", "ábamos", "abais", "aban"],
    sub: ["e", "es", "e", "emos", "éis", "en"],
  },
  er: {
    present: ["o", "es", "e", "emos", "éis", "en"],
    preterite: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    imperfect: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    sub: ["a", "as", "a", "amos", "áis", "an"],
  },
  ir: {
    present: ["o", "es", "e", "imos", "ís", "en"],
    preterite: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    imperfect: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    sub: ["a", "as", "a", "amos", "áis", "an"],
  },
};
const FUT = ["é", "ás", "á", "emos", "éis", "án"];
const COND = ["ía", "ías", "ía", "íamos", "íais", "ían"];
// Stem changes whose nosotros/vosotros revert to the unstressed stem in the subjunctive.
const BOOT = new Set(["e:ie", "o:ue", "u:ue", "i:ie", "u:ú", "i:í"]);

function isUir(inf: string): boolean {
  return inf.endsWith("uir") && !inf.endsWith("guir") && !inf.endsWith("quir");
}

function buildPresent(inf: string, g: "ar" | "er" | "ir", cfg: VerbConfig): string[] {
  if (cfg.overrides?.present) return cfg.overrides.present;
  const stem = stemOf(inf);
  const changed = cfg.stemChange ? applyStemChange(stem, cfg.stemChange) : stem;
  const uir = isUir(inf);
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (i === 0 && cfg.presentYo) {
      out.push(cfg.presentYo);
      continue;
    }
    const stressed = i === 0 || i === 1 || i === 2 || i === 5;
    let s = stressed ? changed : stem;
    if (uir && stressed) s = stem + "y";
    out.push(s + END[g].present[i]);
  }
  return out;
}

function buildPreterite(inf: string, g: "ar" | "er" | "ir", cfg: VerbConfig): string[] {
  if (cfg.overrides?.preterite) return cfg.overrides.preterite;
  const stem = stemOf(inf);

  if (cfg.preteriteStem) {
    const e = ["e", "iste", "o", "imos", "isteis", "ieron"];
    if (cfg.preteriteStem.endsWith("j")) e[5] = "eron";
    const out = e.map((end) => cfg.preteriteStem + end);
    if (inf === "hacer") out[2] = "hizo";
    if (inf === "satisfacer") out[2] = "satisfizo";
    return out;
  }
  // vowel-stem -er/-ir (leer, creer, poseer, caer, oír): i -> y in 3rd person, accents.
  // The 'u' of -guir/-quir is part of a digraph, not a true vowel here.
  if (
    (g === "er" || g === "ir") &&
    endsVowel(stem) &&
    !isUir(inf) &&
    !inf.endsWith("guir") &&
    !inf.endsWith("quir")
  ) {
    return [
      stem + "í",
      stem + "íste",
      stem + "yó",
      stem + "ímos",
      stem + "ísteis",
      stem + "yeron",
    ];
  }
  if (isUir(inf)) {
    return [
      stem + "í",
      stem + "iste",
      stem + "yó",
      stem + "imos",
      stem + "isteis",
      stem + "yeron",
    ];
  }
  // -ir boot verbs change 3rd person (pidió/pidieron, durmió, sintió).
  const e = END[g].preterite;
  return e.map((end, i) => {
    let s = stem;
    if (g === "ir" && cfg.stemChange && (i === 2 || i === 5)) s = secondaryChange(stem, cfg.stemChange);
    return joinOrtho(inf, s, end);
  });
}

function buildImperfect(inf: string, g: "ar" | "er" | "ir", cfg: VerbConfig): string[] {
  if (cfg.overrides?.imperfect) return cfg.overrides.imperfect;
  const stem = stemOf(inf);
  return END[g].imperfect.map((e) => stem + e);
}

function buildFuture(inf: string, cfg: VerbConfig, endings: string[], key: Tense): string[] {
  if (cfg.overrides?.[key]) return cfg.overrides[key]!;
  const base = cfg.futureStem ?? inf;
  return endings.map((e) => base + e);
}

function buildPresentSub(
  inf: string,
  g: "ar" | "er" | "ir",
  cfg: VerbConfig,
  present: string[]
): string[] {
  if (cfg.overrides?.presentSubjunctive) return cfg.overrides.presentSubjunctive;
  const yo = present[0];
  const yoStem = yo.endsWith("o") ? yo.slice(0, -1) : stemOf(inf);
  const plain = stemOf(inf);
  const endings = END[g].sub;
  // Boot verbs revert nosotros/vosotros to the plain stem — UNLESS the yo form is
  // consonant-irregular (tener->tengamos, venir->vengamos keep the yo-stem everywhere).
  const revert = cfg.stemChange ? BOOT.has(cfg.stemChange) && !cfg.presentYo : false;
  return endings.map((end, i) => {
    if (revert && (i === 3 || i === 4)) {
      const s = g === "ir" ? secondaryChange(plain, cfg.stemChange) : plain;
      return joinOrtho(inf, s, end);
    }
    return joinOrtho(inf, yoStem, end);
  });
}

function buildImperfectSub(cfg: VerbConfig, preterite: string[]): string[] {
  if (cfg.overrides?.imperfectSubjunctive) return cfg.overrides.imperfectSubjunctive;
  const base = preterite[5].replace(/ron$/, "");
  return [
    base + "ra",
    base + "ras",
    base + "ra",
    accentLastVowel(base) + "ramos",
    base + "rais",
    base + "ran",
  ];
}

export function conjugate(inf: string): Conjugation {
  const cfg: VerbConfig = IRREGULARS[inf] ?? {};
  const g = group(inf);
  const present = buildPresent(inf, g, cfg);
  const preterite = buildPreterite(inf, g, cfg);
  const imperfect = buildImperfect(inf, g, cfg);
  const future = buildFuture(inf, cfg, FUT, "future");
  const conditional = buildFuture(inf, cfg, COND, "conditional");
  const presentSubjunctive = buildPresentSub(inf, g, cfg, present);
  const imperfectSubjunctive = buildImperfectSub(cfg, preterite);
  return {
    present,
    preterite,
    imperfect,
    future,
    conditional,
    presentSubjunctive,
    imperfectSubjunctive,
  };
}
