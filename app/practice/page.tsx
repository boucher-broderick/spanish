import Link from "next/link";
import { Card } from "@/components/ui";
import { GAME_LIST } from "@/lib/practice";

export default function PracticePage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Practice</h1>
          <p className="text-sm text-slate-500">Quick drills with instant feedback.</p>
        </div>
        <Link href="/" className="text-sm font-semibold text-indigo-600 hover:underline">← Home</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {GAME_LIST.map((g) => (
          <Link key={g.key} href={`/practice/${g.key}`}>
            <Card className="flex h-full flex-col p-5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
              <span className="text-3xl">{g.emoji}</span>
              <span className="mt-3 text-lg font-bold text-slate-900">{g.title}</span>
              <span className="mt-1 text-sm text-slate-500">{g.blurb}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
