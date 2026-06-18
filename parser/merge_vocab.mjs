// Assemble data/vocab.json from per-unit partials in parser/cache/vocab/unit-*.json.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "parser", "cache", "vocab");

const files = readdirSync(DIR).filter((f) => /^unit-\d+\.json$/.test(f)).sort();
const units = files
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")))
  .sort((a, b) => a.unit - b.unit);

writeFileSync(join(ROOT, "data", "vocab.json"), JSON.stringify({ units }, null, 2) + "\n");
console.log(`merged ${units.length} unit(s) -> data/vocab.json: ${units.map((u) => u.unit).join(", ")}`);
