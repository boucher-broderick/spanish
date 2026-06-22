// Merge a verb-examples workflow output file into parser/cache/examples/verbs.json.
// Keyed by verb id, so re-runs are idempotent and partial progress is preserved.
//   node parser/cache/examples/_merge.mjs <workflow-output-file>
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const outFile = process.argv[2];
if (!outFile) { console.error("usage: _merge.mjs <output-file>"); process.exit(1); }
const CACHE = "parser/cache/examples/verbs.json";

let raw = readFileSync(outFile, "utf8").trim();
// The file holds the workflow's returned JSON; isolate the outermost object.
const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
if (s < 0 || e < 0) { console.error("no JSON object in output file"); process.exit(1); }
const parsed = JSON.parse(raw.slice(s, e + 1));
// workflow output wraps the return value under .result -> { results: [...] }
const results = parsed.result?.results ?? parsed.results ?? parsed.result ?? parsed;
if (!Array.isArray(results)) { console.error("could not locate results array; keys:", Object.keys(parsed)); process.exit(1); }

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
let added = 0, bad = 0;
for (const r of results) {
  if (!r?.id || !Array.isArray(r.examples) || r.examples.length !== 6) { bad++; continue; }
  if (!cache[r.id]) added++;
  cache[r.id] = r.examples;
}
writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
console.log(`merged ${added} new (${bad} skipped); cache now holds ${Object.keys(cache).length} verbs`);
