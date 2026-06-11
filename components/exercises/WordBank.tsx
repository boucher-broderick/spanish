"use client";
import { useMemo, useState } from "react";
import { Word } from "@/lib/domain";
import { TENSES, Tense } from "@/lib/conjugation/types";
import { Button, Pill } from "../ui";
import { PromptHeader } from "./shared";

type Graded = { wordId: string; correct: boolean; note?: string };

// Build the LLM grading prompt the user copies out.
function buildPrompt(words: Word[], tenses: Tense[], paragraph: string): string {
  const tenseLabels = TENSES.filter((t) => tenses.includes(t.id)).map((t) => t.label).join(", ");
  const list = words.map((w) => `- ${w.id} — ${w.spanish} — ${w.english}`).join("\n");
  return `You are a strict but fair Spanish teacher. A student wrote a paragraph trying to use specific target words correctly in Spanish.

For EACH target word, decide if it was used correctly: correct meaning AND grammatically correct (including appropriate conjugation for verbs). Where verbs are used, the student is practicing these tenses: ${tenseLabels}.

Target words (id — spanish — english):
${list}

Student paragraph:
"""
${paragraph.trim()}
"""

Respond with ONLY this JSON, no markdown fences, no other text:
{"results":[{"id":"<exact id>","correct":true,"note":"<short feedback>"}]}
Include exactly one entry per target word, using the exact id shown above.`;
}

// Tolerant JSON extraction from a pasted LLM reply.
function parseResults(raw: string, words: Word[]): Graded[] | null {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const arr: { id?: string; correct?: boolean; note?: string }[] = obj.results ?? [];
    const byId = new Map(arr.map((r) => [String(r.id), r]));
    const out: Graded[] = [];
    for (const w of words) {
      const r = byId.get(w.id);
      if (r && typeof r.correct === "boolean") out.push({ wordId: w.id, correct: r.correct, note: r.note });
    }
    return out;
  } catch {
    return null;
  }
}

export function WordBank({
  words,
  tenses,
  tracking,
  onComplete,
}: {
  words: Word[];
  tenses: Tense[];
  tracking: boolean;
  onComplete: (results: Graded[]) => void;
}) {
  const [paragraph, setParagraph] = useState("");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [graded, setGraded] = useState<Graded[] | null>(null);
  const [error, setError] = useState("");

  const prompt = useMemo(() => buildPrompt(words, tenses, paragraph), [words, tenses, paragraph]);
  const wordsById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't access clipboard — select the prompt text and copy manually.");
    }
  }

  function score() {
    setError("");
    const res = parseResults(pasted, words);
    if (!res || res.length === 0) {
      setError("Couldn't read the JSON. Paste the full {\"results\":[…]} reply from the LLM.");
      return;
    }
    setGraded(res);
  }

  if (graded) {
    const correctCount = graded.filter((g) => g.correct).length;
    return (
      <div className="space-y-4">
        <PromptHeader eyebrow="Word Bank · Results">
          {correctCount} / {graded.length} used correctly
        </PromptHeader>
        <div className="space-y-2">
          {graded.map((g) => {
            const w = wordsById.get(g.wordId)!;
            return (
              <div key={g.wordId} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{w.spanish}</span>
                  <Pill tone={g.correct ? "green" : "amber"}>{g.correct ? "correct" : "off"}</Pill>
                </div>
                {g.note && <p className="mt-1 text-sm text-slate-500">{g.note}</p>}
              </div>
            );
          })}
        </div>
        <Button className="w-full" onClick={() => onComplete(graded)}>
          {tracking ? "Save & finish round" : "Finish"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PromptHeader eyebrow="Word Bank">
        Write a short paragraph that uses all {words.length} words. Then grade it with an LLM.
      </PromptHeader>

      <div className="flex flex-wrap gap-2">
        {words.map((w) => (
          <span key={w.id} className="rounded-lg bg-indigo-50 px-2.5 py-1 text-sm text-indigo-700">
            <b>{w.spanish}</b> <span className="text-indigo-400">· {w.english}</span>
          </span>
        ))}
      </div>

      <textarea
        value={paragraph}
        onChange={(e) => setParagraph(e.target.value)}
        rows={5}
        placeholder="Escribe tu párrafo aquí…"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyPrompt} disabled={!paragraph.trim()}>
          {copied ? "Copied ✓" : "Copy LLM prompt"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Paste the prompt into ChatGPT/Claude, then paste its JSON reply below and press Score.
      </p>

      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={4}
        placeholder='{"results":[…]}'
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button className="w-full" onClick={score} disabled={!pasted.trim()}>
        Score paragraph
      </Button>
    </div>
  );
}
