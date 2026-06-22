// Merge a conjugation workflow output file into parser/cache/conjugations/verbs.json
// (keyed by verb id). Idempotent.  node parser/cache/conjugations/_merge.mjs <output-file>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const outFile = process.argv[2];
if (!outFile) { console.error("usage: _merge.mjs <output-file>"); process.exit(1); }
const CACHE = "parser/cache/conjugations/verbs.json";
const TENSES = ["present", "preterite", "imperfect", "future", "conditional", "present_subjunctive"];
const PERSONS = ["yo", "tu", "el", "nosotros", "ellos"];

const raw = readFileSync(outFile, "utf8").trim();
const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
const parsed = JSON.parse(raw.slice(s, e + 1));
const results = parsed.result?.results ?? parsed.results ?? parsed.result ?? parsed;
if (!Array.isArray(results)) { console.error("no results array; keys:", Object.keys(parsed)); process.exit(1); }

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let added = 0, bad = 0;
for (const r of results) {
  if (!r?.id || !r.tenses) { bad++; continue; }
  const ok = TENSES.every((t) => r.tenses[t] && PERSONS.every((p) => typeof r.tenses[t][p] === "string"));
  if (!ok) { bad++; continue; }
  if (!cache[r.id]) added++;
  cache[r.id] = r.tenses;
}
writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
console.log(`merged ${added} new (${bad} skipped); cache now holds ${Object.keys(cache).length} verbs`);
