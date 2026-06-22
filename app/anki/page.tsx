import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/api-auth";
import { AnkiOverview } from "@/components/anki/AnkiOverview";

export default async function AnkiPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex-1">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-900">📇 Daily Anki</h1>
        <Link href="/" className="text-sm font-semibold text-indigo-600 hover:underline">← Home</Link>
      </div>
      <AnkiOverview />
    </div>
  );
}
