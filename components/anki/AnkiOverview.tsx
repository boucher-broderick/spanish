"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Pill, Button } from "@/components/ui";

type CardType = "word_id" | "tense_id" | "note_id";
interface Summary {
  cardId: string; cardType: CardType; name: string; en: string | null;
  wordType: string | null; tense: string | null; section: string | null;
  stage: number; status: string; nextDue: string | null; lastReviewed: string | null;
}

const typeTone = (t: CardType) => (t === "tense_id" ? "indigo" : t === "note_id" ? "amber" : "green");
const typeLabel = (t: CardType) => (t === "tense_id" ? "verb" : t === "note_id" ? "note" : "word");
const today = () => new Date().toISOString().slice(0, 10);

// due date asc, then stage asc
const byDueThenStage = (a: Summary, b: Summary) =>
  (a.nextDue ?? "").localeCompare(b.nextDue ?? "") || a.stage - b.stage;

export function AnkiOverview() {
  const [cards, setCards] = useState<Summary[] | null>(null);
  const [newToday, setNewToday] = useState<Summary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/anki/summary")
      .then((r) => r.json())
      .then((d: { cards?: Summary[]; newToday?: Summary[]; error?: string }) => {
        if (d.error) setErr("Please sign in.");
        else { setCards(d.cards ?? []); setNewToday(d.newToday ?? []); }
      })
      .catch(() => setErr("Failed to load overview."));
  }, []);

  if (err) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{err}</div>;
  if (!cards) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">Loading…</div>;

  const d = today();
  const dueToday = cards.filter((c) => c.nextDue && c.nextDue <= d).sort(byDueThenStage);
  const future = cards.filter((c) => c.nextDue && c.nextDue > d).sort(byDueThenStage);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <span className="text-sm">
          <b className="text-slate-900">{newToday.length}</b> <span className="text-slate-500">new today</span>
          <span className="mx-2 text-slate-300">·</span>
          <b className="text-slate-900">{dueToday.length}</b> <span className="text-slate-500">due today</span>
          <span className="mx-2 text-slate-300">·</span>
          <b className="text-slate-900">{cards.length}</b> <span className="text-slate-500">cards started</span>
        </span>
        <Link href="/anki/study"><Button>Study now →</Button></Link>
      </Card>

      <CardTable title="New today" rows={newToday} empty="No new words left for today. ✓" hideDue />
      <div className="h-5" />
      <CardTable title="Review today" rows={dueToday} empty="Nothing due today. 🎉" />
      <div className="h-5" />
      <CardTable title="Review later" rows={future} empty="No future reviews scheduled yet." />
    </div>
  );
}

function CardTable({ title, rows, empty, hideDue = false }: { title: string; rows: Summary[]; empty: string; hideDue?: boolean }) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-bold text-slate-700">{title} <span className="text-slate-400">({rows.length})</span></h2>
      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Word</th>
                <th className="px-4 py-2">English</th>
                {!hideDue && <th className="px-4 py-2">Stage</th>}
                {!hideDue && <th className="px-4 py-2">Next due</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={`${c.cardType}:${c.cardId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2"><Pill tone={typeTone(c.cardType)}>{typeLabel(c.cardType)}</Pill></td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.tense && <span className="ml-2 text-xs text-slate-400">{c.tense}</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{c.en ?? "—"}</td>
                  {!hideDue && <td className="px-4 py-2"><Pill tone="slate">stage {c.stage}</Pill></td>}
                  {!hideDue && <td className="px-4 py-2 text-slate-500">{c.nextDue ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
