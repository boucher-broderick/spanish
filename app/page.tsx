import Link from "next/link";
import { currentUser } from "@/lib/api-auth";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui";
import { isDailyComplete } from "@/lib/cards";

const TILES = [
  { href: "/course", emoji: "📖", title: "Course work", blurb: "Read the textbook and do the exercises right on the page." },
  { href: "/vocab", emoji: "🗂️", title: "Vocabulary", blurb: "Verbs, nouns, adjectives, and adverbs by unit and section." },
  // Locked until today's Anki goal is met — the forcing function.
  { href: "/practice", emoji: "🎯", title: "Practice", blurb: "Reading, writing, listening & drills.", lockable: true },
];

export default async function Home() {
  const user = await currentUser();
  const dailyComplete = user ? await isDailyComplete().catch(() => true) : true;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Complete Spanish Grammar</h1>
          <p className="text-sm text-slate-500">{user ? `Hi, ${user}. ` : null}What do you want to do?</p>
        </div>
        <SignOutButton />
      </div>

      {/* Primary: daily Anki */}
      <Link href="/anki">
        <Card className={`mb-4 flex items-center gap-4 p-5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 ${dailyComplete ? "border-green-200 bg-green-50/40" : ""}`}>
          <span className="text-4xl">📇</span>
          <div className="min-w-0 flex-1">
            <span className="text-lg font-bold text-slate-900">Daily Anki {dailyComplete ? "✓" : ""}</span>
            <p className="mt-0.5 text-sm text-slate-500">
              {dailyComplete ? "Done for today — come back tomorrow, or keep reviewing." : "Learn 10 new words and clear your reviews."}
            </p>
          </div>
          <span className="text-indigo-500">→</span>
        </Card>
      </Link>

      <div className="grid gap-4 sm:grid-cols-3">
        {TILES.map((t) => {
          const locked = t.lockable && !dailyComplete;
          const inner = (
            <Card className={`flex h-full flex-col p-5 transition-colors ${locked ? "opacity-60" : "hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
              <span className="text-3xl">{locked ? "🔒" : t.emoji}</span>
              <span className="mt-3 text-lg font-bold text-slate-900">{t.title}</span>
              <span className="mt-1 text-sm text-slate-500">
                {locked ? "Finish today's Anki to unlock." : t.blurb}
              </span>
            </Card>
          );
          return locked ? <div key={t.href}>{inner}</div> : <Link key={t.href} href={t.href}>{inner}</Link>;
        })}
      </div>
    </div>
  );
}
