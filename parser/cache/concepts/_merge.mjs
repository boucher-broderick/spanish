// Merge a concept-flashcards workflow output into parser/cache/concepts/cards.json
// (flat array of {unit, sectionIdx, kind, prompt, answer, tense}). Idempotent by
// (unit, sectionIdx): re-running replaces a section's cards.
//   node parser/cache/concepts/_merge.mjs <output-file>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const outFile = process.argv[2];
if (!outFile) { console.error("usage: _merge.mjs <output-file>"); process.exit(1); }
const CACHE = "parser/cache/concepts/cards.json";
const raw = readFileSync(outFile, "utf8").trim();
const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
const parsed = JSON.parse(raw.slice(s, e + 1));
const results = parsed.result?.results ?? parsed.results ?? parsed.result ?? parsed;
if (!Array.isArray(results)) { console.error("no results array; keys:", Object.keys(parsed)); process.exit(1); }

// Collect all cards; dedup only on identical (unit, prompt) so re-runs don't pile up.
const existing = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : [];
const seen = new Set(existing.map((c) => `${c.unit}|${c.prompt}`));
const flat = [...existing];
let sections = 0, added = 0;
for (const r of results) {
  if (typeof r?.unit !== "number" || typeof r?.sectionIdx !== "number" || !Array.isArray(r.cards)) continue;
  sections++;
  for (const c of r.cards) {
    if (!c?.prompt || !c?.answer || !c?.kind) continue;
    const key = `${r.unit}|${c.prompt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push({ unit: r.unit, sectionIdx: r.sectionIdx, kind: c.kind, prompt: c.prompt, answer: c.answer, tense: c.tense ?? null });
    added++;
  }
}
writeFileSync(CACHE, JSON.stringify(flat, null, 2) + "\n");
console.log(`processed ${sections} sections; added ${added}; cache now holds ${flat.length} concept cards`);
