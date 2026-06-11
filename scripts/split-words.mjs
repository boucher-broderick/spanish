// Splits data/words.json into N chunk files for parallel sentence generation.
// Run: node scripts/split-words.mjs [N]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const N = Number(process.argv[2] || 8);
const words = JSON.parse(readFileSync(join(ROOT, "data", "words.json"), "utf8"));
mkdirSync(join(ROOT, "data", "_chunks"), { recursive: true });

const slim = words.map((w) => ({
  id: w.id,
  spanish: w.spanish,
  english: w.english,
  pos: w.pos,
  lemma: w.lemma,
}));
const per = Math.ceil(slim.length / N);
for (let i = 0; i < N; i++) {
  const chunk = slim.slice(i * per, (i + 1) * per);
  writeFileSync(join(ROOT, "data", "_chunks", `chunk-${i}.json`), JSON.stringify(chunk, null, 2));
}
console.log(`Wrote ${N} chunks (~${per} words each) to data/_chunks/`);
