"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill, cx } from "@/components/ui";

// ---- card shapes (mirror lib/cards.ts) ----
type CardType = "word_id" | "tense_id" | "note_id";
interface Conjugation { tense: string; yo: string | null; tu: string | null; el: string | null; nosotros: string | null; ellos: string | null }
interface Word { wordId: string; type: string; en: string; es: string; gender: string | null }
interface Example { exampleId: string; exampleEn: string; exampleEs: string }
interface Note { noteId: string; notePrompt: string; noteAnswer: string }
interface StudyCard {
  info: { cardId: string; cardType: CardType; section: string | null; status: string };
  stats: { stage: number };
  conjugation?: Conjugation;
  word?: Word;
  examples?: Example[];
  note?: Note;
}
interface Session { reviews: StudyCard[]; newCards: StudyCard[]; dailyNewRemaining: number }
type Rating = "dont_know" | "know" | "really_know";
interface Answer { correct: boolean; rating?: Rating }
interface GradeRes { completed: boolean; stage: number; outcome: string; countedNew: boolean }
interface Status {
  locked: boolean; dueCount: number; newAvailable: number; dailyNewRemaining: number;
  newSeen: number; reviewsCompleted: number; correct: number; wrong: number; accuracy: number | null;
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const eq = (a: string, b: string | null) => norm(a) === norm(b ?? "");
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Interleave: after every `step` reviews, drop in one new card. step = reviews/10.
function interleave(reviews: StudyCard[], news: StudyCard[]): StudyCard[] {
  const step = Math.max(1, Math.floor(reviews.length / 10));
  const out: StudyCard[] = [];
  let ni = 0;
  reviews.forEach((r, i) => {
    out.push(r);
    if ((i + 1) % step === 0 && ni < news.length) out.push(news[ni++]);
  });
  while (ni < news.length) out.push(news[ni++]);
  return out;
}

const fieldCx = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function StudySession() {
  const [queue, setQueue] = useState<StudyCard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [newBudget, setNewBudget] = useState(0); // "I don't know" allowance left today
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/anki/session")
      .then((r) => r.json())
      .then((d: Session & { error?: string }) => {
        if (d.error) { setErr("Please sign in."); return; }
        setNewBudget(d.dailyNewRemaining ?? 0);
        setQueue(interleave(d.reviews ?? [], d.newCards ?? []));
      })
      .catch(() => setErr("Failed to load session."));
  }, []);

  // Once the daily "I don't know" budget is gone, skip any not-yet-seen NEW cards.
  useEffect(() => {
    if (!queue || idx >= queue.length) return;
    if (queue[idx].info.status === "new" && newBudget <= 0) setIdx((i) => i + 1);
  }, [idx, queue, newBudget]);

  // Session finished → pull the summary + lock state.
  useEffect(() => {
    if (queue && queue.length > 0 && idx >= queue.length && !status) {
      fetch("/api/anki/status").then((r) => r.json()).then(setStatus).catch(() => {});
    }
  }, [queue, idx, status]);

  async function grade(card: StudyCard, answer: Answer) {
    let res: GradeRes | null = null;
    try {
      res = await fetch("/api/anki/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardType: card.info.cardType, cardId: card.info.cardId,
          status: card.info.status, correct: answer.correct, rating: answer.rating,
        }),
      }).then((r) => r.json());
    } catch { /* network hiccup — still advance so the session isn't stuck */ }

    if (res?.countedNew) setNewBudget((b) => b - 1);
    setQueue((q) => {
      if (!q) return q;
      const nq = q.slice();
      if (res && !res.completed) {
        // still owed (drill / not yet 3-in-a-row) → requeue as a review at the end
        nq.push({ ...card, info: { ...card.info, status: "review" }, stats: { ...card.stats, stage: res.stage } });
      }
      return nq;
    });
    setIdx((i) => i + 1);
  }

  if (err) return <Centered>{err}</Centered>;
  if (!queue) return <Centered>Loading…</Centered>;
  if (queue.length === 0) {
    return <Centered>Nothing to study right now. 🎉<div className="mt-4"><Link href="/anki"><Button variant="secondary">Back to overview</Button></Link></div></Centered>;
  }
  if (idx >= queue.length) return <SummaryView status={status} />;

  const card = queue[idx];
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>{idx + 1} / {queue.length}</span>
        <Pill tone={card.info.status === "new" ? "green" : "indigo"}>{card.info.status}</Pill>
      </div>
      <CardView key={idx} card={card} onGrade={(a) => grade(card, a)} onSkip={() => setIdx((i) => i + 1)} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{children}</div>;
}

function CardView({ card, onGrade, onSkip }: { card: StudyCard; onGrade: (a: Answer) => void; onSkip: () => void }) {
  if (card.info.cardType === "note_id" && card.note) return <NoteCard card={card} onGrade={onGrade} />;
  if (card.info.cardType === "tense_id" && card.conjugation) return <VerbCard card={card} onGrade={onGrade} />;
  if (card.info.cardType === "word_id" && card.word) return <WordCard card={card} onGrade={onGrade} />;
  return (
    <Card className="p-6 text-center text-slate-400">
      <p className="mb-4">Card content unavailable ({card.info.cardType}).</p>
      <Button onClick={onSkip}>Skip</Button>
    </Card>
  );
}

// Shared post-answer controls. `firstCorrect` is the graded result (the FIRST attempt);
// `gateSatisfied` reflects the inputs RIGHT NOW. New + first-correct → the 3 self-ratings;
// otherwise a Next that stays disabled until every field has been corrected.
function Outcome({ checked, firstCorrect, gateSatisfied, isNew, onCheck, onGrade }: {
  checked: boolean; firstCorrect: boolean; gateSatisfied: boolean; isNew: boolean; onCheck: () => void; onGrade: (a: Answer) => void;
}) {
  if (!checked) return <div className="mt-6 flex justify-end"><Button onClick={onCheck}>Check</Button></div>;
  if (isNew && firstCorrect) {
    return (
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="danger" onClick={() => onGrade({ correct: true, rating: "dont_know" })}>I don&apos;t know it</Button>
        <Button variant="success" onClick={() => onGrade({ correct: true, rating: "know" })}>I know it</Button>
        <Button onClick={() => onGrade({ correct: true, rating: "really_know" })}>I really know it</Button>
      </div>
    );
  }
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      {!gateSatisfied && <span className="text-xs text-slate-400">Fill in the correct answer to continue</span>}
      <Button disabled={!gateSatisfied} onClick={() => onGrade({ correct: firstCorrect })}>Next →</Button>
    </div>
  );
}

// ---- Note: prompt → flip → self-rate ----
function NoteCard({ card, onGrade }: { card: StudyCard; onGrade: (a: Answer) => void }) {
  const note = card.note!;
  const isNew = card.info.status === "new";
  const [flipped, setFlipped] = useState(false);
  return (
    <Card className="p-6">
      <Pill tone="amber">note</Pill>
      {!flipped ? (
        <button onClick={() => setFlipped(true)} className="mt-4 block w-full text-left">
          <p className="text-lg font-medium text-slate-900">{note.notePrompt}</p>
          <p className="mt-6 text-sm text-slate-400">Click to reveal answer</p>
        </button>
      ) : (
        <>
          <p className="mt-4 text-base text-slate-600">{note.notePrompt}</p>
          <p className="mt-3 border-t border-slate-100 pt-3 text-lg font-medium text-slate-900">{note.noteAnswer}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="danger" onClick={() => onGrade({ correct: false })}>I don&apos;t know it</Button>
            <Button variant="success" onClick={() => onGrade(isNew ? { correct: true, rating: "know" } : { correct: true })}>I know it</Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ---- Non-verb word: English → type Spanish → Check (auto-graded) → rate / Next ----
function WordCard({ card, onGrade }: { card: StudyCard; onGrade: (a: Answer) => void }) {
  const word = card.word!;
  const isNew = card.info.status === "new";
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [firstCorrect, setFirstCorrect] = useState(false);
  const liveCorrect = eq(value, word.es);
  const doCheck = () => { setFirstCorrect(liveCorrect); setChecked(true); };
  return (
    <Card className="p-6">
      <Pill tone="green">word</Pill>
      <p className="mt-4 text-2xl font-semibold text-slate-900">{word.en}</p>
      <input
        autoFocus
        className={cx(fieldCx, "mt-5")}
        placeholder="Type the Spanish…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !checked) doCheck(); }}
      />
      {checked && (
        <p className={cx("mt-3 text-lg font-medium", liveCorrect ? "text-emerald-700" : "text-rose-600")}>
          {liveCorrect ? "✓ " : "✗ "}{word.es}
        </p>
      )}
      <Outcome checked={checked} firstCorrect={firstCorrect} gateSatisfied={liveCorrect} isNew={isNew} onCheck={doCheck} onGrade={onGrade} />
    </Card>
  );
}

// ---- Verb (tense): infinitive (from EN + 2 examples) → conjugations → graded ----
function VerbCard({ card, onGrade }: { card: StudyCard; onGrade: (a: Answer) => void }) {
  const conj = card.conjugation!;
  const isNew = card.info.status === "new";
  const examples = useMemo(() => shuffle(card.examples ?? []).slice(0, 2), [card]);
  const persons = useMemo(
    () => shuffle<[string, string | null]>([
      ["yo", conj.yo], ["tú", conj.tu], ["él/ella/usted", conj.el],
      ["nosotros", conj.nosotros], ["ellos/ellas/ustedes", conj.ellos],
    ]),
    [conj]
  );
  const [inf, setInf] = useState("");
  const [infChecked, setInfChecked] = useState(false);
  const [infFirstCorrect, setInfFirstCorrect] = useState(false);
  const [forms, setForms] = useState<Record<string, string>>({});
  const [conjChecked, setConjChecked] = useState(false);
  const [conjFirstCorrect, setConjFirstCorrect] = useState(false);

  const liveInfCorrect = eq(inf, card.word?.es ?? null);
  const liveAllConj = persons.every(([label, ans]) => eq(forms[label] ?? "", ans));
  const gateSatisfied = liveInfCorrect && liveAllConj;   // all fields right now
  const firstCorrect = infFirstCorrect && conjFirstCorrect; // graded result (first attempt)
  const doInfCheck = () => { setInfFirstCorrect(liveInfCorrect); setInfChecked(true); };
  const doConjCheck = () => { setConjFirstCorrect(liveAllConj); setConjChecked(true); };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Pill tone="indigo">verb</Pill>
        <span className="text-xs text-slate-400">{conj.tense}</span>
      </div>

      {/* step 1 — infinitive */}
      <p className="mt-4 text-2xl font-semibold text-slate-900">{card.word?.en ?? "—"}</p>
      <ul className="mt-3 space-y-2">
        {examples.map((e) => (
          <li key={e.exampleId} className="text-sm text-slate-600">
            • {e.exampleEn}
            {infChecked && <div className="ml-3 mt-0.5 text-emerald-700">{e.exampleEs}</div>}
          </li>
        ))}
      </ul>
      <input
        autoFocus
        className={cx(fieldCx, "mt-4")}
        placeholder="Infinitive (Spanish)…"
        value={inf}
        onChange={(e) => setInf(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !infChecked) doInfCheck(); }}
      />
      {infChecked && (
        <p className={cx("mt-2 text-lg font-medium", liveInfCorrect ? "text-emerald-700" : "text-rose-600")}>
          {liveInfCorrect ? "✓ " : "✗ "}{card.word?.es ?? "—"}
        </p>
      )}

      {!infChecked ? (
        <div className="mt-6 flex justify-end"><Button onClick={doInfCheck}>Check</Button></div>
      ) : (
        <>
          {/* step 2 — conjugation */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-500">Conjugate — {conj.tense}</p>
            <div className="mt-3 space-y-2">
              {persons.map(([label, ans]) => {
                const ok = eq(forms[label] ?? "", ans);
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-slate-500">{label}</span>
                    <input
                      className={fieldCx}
                      placeholder="…"
                      value={forms[label] ?? ""}
                      onChange={(e) => setForms((f) => ({ ...f, [label]: e.target.value }))}
                    />
                    {conjChecked && (
                      <span className={cx("w-32 shrink-0 text-sm font-medium", ok ? "text-emerald-700" : "text-rose-600")}>
                        {ok ? "✓ " : "✗ "}{ans ?? "—"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <Outcome checked={conjChecked} firstCorrect={firstCorrect} gateSatisfied={gateSatisfied} isNew={isNew} onCheck={doConjCheck} onGrade={onGrade} />
        </>
      )}
    </Card>
  );
}

// ---- end-of-session summary + lock ----
function SummaryView({ status }: { status: Status | null }) {
  if (!status) return <Centered>Wrapping up…</Centered>;
  const { correct, wrong, accuracy, newSeen, reviewsCompleted, locked, dueCount, newAvailable } = status;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-900">Session complete 🎉</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Correct" value={correct} />
          <Stat label="Wrong" value={wrong} />
          <Stat label="New seen" value={newSeen} />
          <Stat label="Reviews completed" value={reviewsCompleted} />
        </div>
        {accuracy != null && <p className="mt-4 text-2xl font-bold text-indigo-600">{accuracy}%</p>}
        <p className="mt-6 text-sm text-slate-500">
          {locked
            ? "You're all caught up — locked until tomorrow. 🔒"
            : `${dueCount} due · ${newAvailable} new still available.`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!locked && <Link href="/anki/study"><Button>Keep going →</Button></Link>}
          <Link href="/anki"><Button variant="secondary">Back to overview</Button></Link>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
