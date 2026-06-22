import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/api-auth";
import { StudySession } from "@/components/anki/StudySession";

export default async function AnkiStudyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-900">📇 Studying</h1>
        <Link href="/anki" className="text-sm font-semibold text-indigo-600 hover:underline">← Overview</Link>
      </div>
      <StudySession />
    </div>
  );
}
