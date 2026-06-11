// Merges data/_sentences/part-*.json into data/sentences.json, validating shape
// and reporting coverage. Run: node scripts/merge-sentences.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const words = JSON.parse(readFileSync(join(ROOT, "data", "words.json"), "utf8"));
const ids = new Set(words.map((w) => w.id));
const dir = join(ROOT, "data", "_sentences");

const merged = {};
let bad = 0;
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const obj = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const [id, s] of Object.entries(obj)) {
      if (!ids.has(id)) continue;
      if (!s || !s.englishSentence || !s.spanishCloze || !s.clozeAnswer) {
        bad++;
        continue;
      }
      // The cloze must actually contain a blank.
      if (!/_{2,}/.test(s.spanishCloze)) {
        bad++;
        continue;
      }
      merged[id] = {
        englishSentence: String(s.englishSentence).trim(),
        spanishCloze: String(s.spanishCloze).trim(),
        clozeAnswer: String(s.clozeAnswer).trim(),
      };
    }
  }
}

writeFileSync(join(ROOT, "data", "sentences.json"), JSON.stringify(merged, null, 2) + "\n");
const cov = ((Object.keys(merged).length / words.length) * 100).toFixed(1);
console.log(`Merged ${Object.keys(merged).length}/${words.length} sentences (${cov}%). Skipped ${bad} malformed.`);
