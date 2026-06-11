// Dumps every verb's full conjugation to data/conjugations.json (committed) and a
// human-readable data/conjugations.txt for auditing. Run: npx tsx scripts/dump-conjugations.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conjugate } from "../lib/conjugation/engine";
import { TENSES } from "../lib/conjugation/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const words = JSON.parse(readFileSync(join(ROOT, "data", "words.json"), "utf8")) as {
  pos: string;
  lemma: string;
  english: string;
}[];

const verbs = words.filter((w) => w.pos === "verb");
const out: Record<string, ReturnType<typeof conjugate>> = {};
const lines: string[] = [];
const persons = ["yo", "tú", "él", "nos", "vos", "ellos"];

for (const v of verbs) {
  const c = conjugate(v.lemma);
  out[v.lemma] = c;
  lines.push(`\n## ${v.lemma} (${v.english})`);
  for (const t of TENSES) {
    const forms = c[t.id].map((f, i) => `${persons[i]}=${f}`).join("  ");
    lines.push(`${t.label.padEnd(20)} ${forms}`);
  }
}

writeFileSync(join(ROOT, "data", "conjugations.json"), JSON.stringify(out, null, 2) + "\n");
writeFileSync(join(ROOT, "data", "conjugations.txt"), lines.join("\n") + "\n");
console.log(`Dumped ${verbs.length} verbs`);
