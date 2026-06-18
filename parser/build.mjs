// Join deterministic page geometry (parser/cache/geometry.json) with Claude's
// text reading (parser/cache/ocr/*.json + parser/cache/answers.json) into the
// data the app serves: data/pages.json (blanks to render per page) and
// data/exercises.json (exercise metadata + answers, for nav/progress/reveal).
//
// No model, no network — this is a pure local merge. Run after detect_all.py and
// after the OCR caches are written.
//
//   node parser/build.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "parser", "cache");
const DATA = join(ROOT, "data");

const PDF_TO_PRINTED = (pdfPage) => pdfPage - 12; // printed p1 == PDF p13
const CY_TOL = 0.03; // max vertical distance to accept a detector blank as a match

// Printed-page where each unit / back-matter section begins (from the table of
// contents). Used to label every page so the reader shows "Unit N · page P".
const UNIT_STARTS = [1, 18, 27, 35, 49, 59, 67, 81, 95, 104, 115, 124, 131, 148,
  162, 175, 190, 211, 225, 244, 253, 266, 276, 293, 301, 308];
const SECTIONS = [
  { from: 317, label: "Verb Tables" },
  { from: 324, label: "Glossary" },
  { from: 341, label: "Answer Key" },
];
function sectionFor(printed) {
  if (printed < 1) return { unit: null, section: "Front Matter" };
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    if (printed >= SECTIONS[i].from) return { unit: null, section: SECTIONS[i].label };
  }
  let u = 1;
  for (let i = 0; i < UNIT_STARTS.length; i++) if (printed >= UNIT_STARTS[i]) u = i + 1;
  return { unit: u, section: `Unit ${u}` };
}

function loadJSON(p, fallback) {
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}

const geometry = loadJSON(join(CACHE, "geometry.json"), {});

// Answers come from answers.json plus any partials in cache/answers/*.json
// (written by the per-range answer-key OCR agents). Merge them all, keyed by
// exercise id then item number.
const answers = loadJSON(join(CACHE, "answers.json"), {}); // { "1-1": { "1": ["vive"], ... } }
const answersDir = join(CACHE, "answers");
if (existsSync(answersDir)) {
  for (const f of readdirSync(answersDir).filter((f) => f.endsWith(".json"))) {
    const part = loadJSON(join(answersDir, f), {});
    for (const [exId, items] of Object.entries(part)) {
      answers[exId] = { ...(answers[exId] || {}), ...items };
    }
  }
}

// Gather every OCR unit file.
const ocrDir = join(CACHE, "ocr");
const ocrFiles = existsSync(ocrDir) ? readdirSync(ocrDir).filter((f) => f.endsWith(".json")) : [];
const ocrPages = []; // flattened page records across units
for (const f of ocrFiles) {
  const u = loadJSON(join(ocrDir, f), null);
  if (!u) continue;
  for (const pg of u.pages || []) ocrPages.push({ unit: u.unit, ...pg });
}

// Match one OCR blank (with coarse cy) to the nearest unused detector blank.
function matchBox(detBlanks, used, cy, cx) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < detBlanks.length; i++) {
    if (used.has(i)) continue;
    const b = detBlanks[i];
    const dcy = Math.abs(b.cy - cy);
    if (dcy > CY_TOL) continue;
    const dcx = cx == null ? 0 : Math.abs(b.cx - cx) * 0.5; // x is a soft tiebreaker
    const d = dcy + dcx;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const pagesOut = [];
const exercises = new Map(); // id -> { id, unit, type, instruction, pages:Set, items:Map }
let stats = { blanks: 0, matched: 0, gradable: 0, unmatched: 0 };

// Index OCR by pdf page so we can emit a record for EVERY rendered page (not just
// exercise pages) — the reader navigates the whole book like a real textbook.
const ocrByPage = new Map();
for (const pg of ocrPages) ocrByPage.set(pg.pdfPage, pg);

const allStems = Object.keys(geometry).sort();
for (const stem of allStems) {
  const pdfPage = Number(stem.replace("page-", ""));
  const geo = geometry[stem];
  const det = geo ? geo.blanks : [];
  const used = new Set();
  const pageBlanks = [];
  const printedPage = PDF_TO_PRINTED(pdfPage);
  const { unit, section } = sectionFor(printedPage);
  const pg = ocrByPage.get(pdfPage) || { pdfPage, unit, exercises: [] };

  for (const ex of pg.exercises || []) {
    let rec = exercises.get(ex.id);
    if (!rec) {
      rec = { id: ex.id, unit: unit, type: ex.type || "fill",
              instruction: ex.instruction || "", pages: new Set(), items: new Map() };
      exercises.set(ex.id, rec);
    }
    if (ex.instruction && !rec.instruction) rec.instruction = ex.instruction;
    rec.pages.add(pdfPage);

    for (const bl of ex.blanks || []) {
      stats.blanks++;
      const ans = answers[ex.id]?.[String(bl.item)] || null;
      const gradable = Array.isArray(ans) && ans.length > 0 && ex.type !== "free";
      const mi = matchBox(det, used, bl.cy, bl.cx ?? null);
      let box = null;
      if (mi >= 0) { used.add(mi); box = det[mi]; stats.matched++; }
      else { stats.unmatched++; }
      if (gradable) stats.gradable++;

      const blank = {
        exId: ex.id, item: bl.item, blankIdx: bl.blankIdx || 0,
        box: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : null,
        answers: ans || [], gradable,
      };
      pageBlanks.push(blank);

      // record on exercise items
      let it = rec.items.get(bl.item);
      if (!it) { it = { n: bl.item, gradable, answers: ans || [], blanks: 0 }; rec.items.set(bl.item, it); }
      it.blanks++;
    }
  }

  pageBlanks.sort((a, b) => (a.box?.y ?? 9) - (b.box?.y ?? 9));
  pagesOut.push({
    pdfPage,
    printedPage,
    unit,
    section,
    image: `/book/${stem}.png`,
    w: geo?.w ?? null, h: geo?.h ?? null,
    exerciseIds: [...new Set((pg.exercises || []).map((e) => e.id))],
    blanks: pageBlanks,
  });
}
pagesOut.sort((a, b) => a.pdfPage - b.pdfPage);

const exercisesOut = [...exercises.values()].map((r) => ({
  id: r.id, unit: r.unit, type: r.type, instruction: r.instruction,
  pages: [...r.pages].sort((a, b) => a - b),
  items: [...r.items.values()].sort((a, b) => a.n - b.n),
})).sort((a, b) => {
  const [au, an] = a.id.split("-").map(Number), [bu, bn] = b.id.split("-").map(Number);
  return au - bu || an - bn;
});

if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, "pages.json"), JSON.stringify(pagesOut, null, 2));
writeFileSync(join(DATA, "exercises.json"), JSON.stringify(exercisesOut, null, 2));

console.log(`pages: ${pagesOut.length}, exercises: ${exercisesOut.length}`);
console.log(`blanks: ${stats.blanks}  matched: ${stats.matched}  unmatched: ${stats.unmatched}  gradable: ${stats.gradable}`);
const unmatched = pagesOut.flatMap((p) => p.blanks.filter((b) => !b.box).map((b) => `${b.exId}.${b.item}@p${p.pdfPage}`));
if (unmatched.length) console.log(`UNMATCHED (no box): ${unmatched.join(", ")}`);
