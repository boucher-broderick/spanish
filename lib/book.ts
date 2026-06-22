// Server-side loader + shared types for the interactive workbook data produced
// by the parser pipeline (data/pages.json, data/exercises.json).
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Box { x: number; y: number; w: number; h: number }

export interface PageBlank {
  exId: string;
  item: number;
  blankIdx: number;
  box: Box | null;
  answers: string[];
  gradable: boolean;
}

export interface BookPage {
  pdfPage: number;
  printedPage: number;
  unit: number | null;
  section: string;
  image: string;
  w: number | null;
  h: number | null;
  exerciseIds: string[];
  blanks: PageBlank[];
}

export interface TocEntry { title: string; page: number }
export interface TocUnit { unit: number; title: string; page: number; sections: TocEntry[] }
export interface Toc { frontMatter: TocEntry[]; units: TocUnit[]; backMatter: TocEntry[] }

export interface VocabWord { es: string; en: string; gender?: string; yo?: string; src?: "example" }
export type VocabPos = "verbs" | "nouns" | "adjectives" | "adverbs" | "expressions";
export interface VocabSection extends Record<VocabPos, VocabWord[]> {
  title: string;
  page: number;
}
export interface VocabUnit { unit: number; title: string; sections: VocabSection[] }

export interface ExerciseItem { n: number; gradable: boolean; answers: string[]; blanks: number }
export interface Exercise {
  id: string;
  unit: number;
  type: string;
  instruction: string;
  pages: number[];
  items: ExerciseItem[];
}

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", file), "utf8")) as T;
}

let _pages: BookPage[] | null = null;
let _exercises: Exercise[] | null = null;
let _toc: Toc | null = null;

/** The table of contents (units + sections + printed page numbers). */
export function toc(): Toc {
  if (!_toc) _toc = read<Toc>("toc.json");
  return _toc;
}

/** Per-unit, per-section vocabulary tables (verbs/nouns/adjectives/adverbs/expressions).
 *  Sourced from Postgres (see lib/vocab-db.ts), with a data/vocab.json fallback. */
export async function allVocab(): Promise<VocabUnit[]> {
  const { loadVocab } = await import("./vocab-db");
  return loadVocab();
}
export async function vocabForUnit(unit: number): Promise<VocabUnit | null> {
  return (await allVocab()).find((u) => u.unit === unit) ?? null;
}

/** printed page -> pdf page (the rendered image). printed p1 == pdf p13. */
export function pdfPageForPrinted(printed: number): number {
  return printed + 12;
}

/** Which TOC section a printed page falls in, for the reader breadcrumb. */
export function sectionTitleForPrinted(printed: number): string | null {
  const t = toc();
  let label: string | null = null;
  for (const u of t.units) {
    for (const s of u.sections) {
      if (s.page <= printed) label = s.title;
    }
  }
  return label;
}

export function allPages(): BookPage[] {
  if (!_pages) _pages = read<BookPage[]>("pages.json");
  return _pages;
}

export function allExercises(): Exercise[] {
  if (!_exercises) _exercises = read<Exercise[]>("exercises.json");
  return _exercises;
}

/** The page record for a given PDF page number, or null if not parsed. */
export function getPage(pdfPage: number): BookPage | null {
  return allPages().find((p) => p.pdfPage === pdfPage) ?? null;
}

/** All pages belonging to a unit, in reading order. */
export function pagesForUnit(unit: number): BookPage[] {
  return allPages()
    .filter((p) => p.unit === unit)
    .sort((a, b) => a.pdfPage - b.pdfPage);
}

/** Sorted list of every rendered PDF page number, for page-by-page navigation. */
export function allPageNumbers(): number[] {
  return allPages().map((p) => p.pdfPage).sort((a, b) => a - b);
}

/** The first readable page (printed page 1). */
export function firstPdfPage(): number {
  return allPageNumbers()[0] ?? 13;
}
