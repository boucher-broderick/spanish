"use client";
import { useEffect, useState } from "react";
import { StoryRow } from "@/lib/composition";
import { Pill } from "../ui";
import { levelLabel, lengthLabel, tenseLabel } from "./controls";

// Master table of every saved story, with quick links into Reading / Listening.
export function StoriesTable({
  onExit,
  onOpen,
}: {
  onExit: () => void;
  onOpen: (story: StoryRow, section: "reading" | "listening") => void;
}) {
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stories")
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => setStories(d.stories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    setStories((s) => s.filter((x) => x.id !== id));
    await fetch(`/api/stories/${id}`, { method: "DELETE" });
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
      <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Back
      </button>
      <h1 className="mb-1 text-xl font-bold text-slate-900">📚 Stories</h1>
      <p className="mb-4 text-sm text-slate-500">Every story you&apos;ve generated. Open one to re-read or listen.</p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-slate-400">No stories yet — generate one in Reading.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Level</th>
                <th className="px-3 py-2 font-semibold">Tense</th>
                <th className="px-3 py-2 font-semibold">Length</th>
                <th className="px-3 py-2 font-semibold">Audio</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 align-middle">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{fmtDate(s.createdAt)}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{s.title}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Pill tone="indigo">{levelLabel(s.level).split(" ")[0]}</Pill>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{tenseLabel(s.tense)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{lengthLabel(s.length).split(" · ")[0]}</td>
                  <td className="px-3 py-2">{s.hasAudio ? <Pill tone="green">✓</Pill> : <span className="text-slate-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex gap-2 text-xs font-medium">
                      <button onClick={() => onOpen(s, "reading")} className="text-indigo-600 hover:text-indigo-800">
                        Read
                      </button>
                      <button onClick={() => onOpen(s, "listening")} className="text-indigo-600 hover:text-indigo-800">
                        Listen
                      </button>
                      <button onClick={() => remove(s.id)} className="text-rose-500 hover:text-rose-700">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
