import Link from "next/link";
import { currentUser } from "@/lib/api-auth";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/ui";

const TILES = [
  { href: "/course", emoji: "📖", title: "Course work", blurb: "Read the textbook and do the exercises right on the page." },
  { href: "/vocab", emoji: "🗂️", title: "Vocabulary", blurb: "Verbs, nouns, adjectives, and adverbs by unit and section." },
  { href: "/practice", emoji: "🎯", title: "Practice", blurb: "Drill numbers, dates, and telling time." },
];

export default async function Home() {
  const user = await currentUser();
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Complete Spanish Grammar</h1>
          <p className="text-sm text-slate-500">{user ? `Hi, ${user}. ` : null}What do you want to do?</p>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="flex h-full flex-col p-5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
              <span className="text-3xl">{t.emoji}</span>
              <span className="mt-3 text-lg font-bold text-slate-900">{t.title}</span>
              <span className="mt-1 text-sm text-slate-500">{t.blurb}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
