import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Pill } from "@/components/ui";
import { vocabForUnit, pdfPageForPrinted, type VocabPos, type VocabWord } from "@/lib/book";

const POS: { key: VocabPos; label: string; tone: "indigo" | "green" | "amber" | "slate" }[] = [
  { key: "verbs", label: "Verbs", tone: "indigo" },
  { key: "nouns", label: "Nouns", tone: "green" },
  { key: "adjectives", label: "Adjectives", tone: "amber" },
  { key: "adverbs", label: "Adverbs", tone: "slate" },
  { key: "expressions", label: "Expressions", tone: "slate" },
];

function Table({ label, tone, words }: { label: string; tone: "indigo" | "green" | "amber" | "slate"; words: VocabWord[] }) {
  if (!words?.length) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-2">
        <Pill tone={tone}>{label}</Pill>
        <span className="text-xs text-slate-400">{words.length}</span>
      </div>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {words.map((w, i) => (
            <tr key={`${w.es}-${i}`} className="border-b border-slate-100 align-top last:border-0">
              <td className="py-1 pr-2 font-medium text-slate-800">
                {w.es}
                {w.gender ? <span className="ml-1 text-xs font-normal text-slate-400">({w.gender})</span> : null}
                {w.yo ? <span className="ml-1 text-xs font-normal text-indigo-400">yo {w.yo}</span> : null}
                {w.src === "example" ? (
                  <span title="from an example sentence" className="ml-1 align-super text-[9px] font-normal text-slate-300">ex</span>
                ) : null}
              </td>
              <td className="py-1 text-slate-500">{w.en}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function VocabUnitPage({ params }: { params: Promise<{ unit: string }> }) {
  const unitNum = Number((await params).unit);
  const u = vocabForUnit(unitNum);
  if (!u) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">
          <span className="text-indigo-600">Unit {u.unit}</span> · {u.title}
        </h1>
        <Link href="/vocab" className="shrink-0 text-sm font-semibold text-indigo-600 hover:underline">← All units</Link>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Words marked <span className="align-super text-[9px] text-slate-400">ex</span> were pulled from the
        example sentences and exercises; the rest are from the section&apos;s vocabulary lists.
      </p>

      <div className="space-y-4">
        {u.sections.map((s, si) => {
          const total = POS.reduce((n, p) => n + (s[p.key]?.length || 0), 0);
          if (total === 0) return null;
          return (
            <div key={si} id={`p${s.page}`} className="scroll-mt-4">
            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
                <Link
                  href={`/unit/${u.unit}#p${pdfPageForPrinted(s.page)}`}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  read · p{s.page}
                </Link>
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap">
                {POS.map((p) => (
                  <Table key={p.key} label={p.label} tone={p.tone} words={s[p.key]} />
                ))}
              </div>
            </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
