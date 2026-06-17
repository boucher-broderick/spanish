import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildLessonVocabPrompt } from "@/lib/composition";
import type { VocabExample } from "@/lib/course";
import { getVocabPack, saveVocabPack } from "@/lib/course-store";
import { getLesson, resolveLessonWords } from "@/lib/curriculum";
import { ensureWords } from "@/lib/course-server";

async function generate(user: string, lessonId: string) {
  await ensureWords();
  const lesson = getLesson(lessonId)!;
  const out = await generateJson<{ items: VocabExample[] }>(
    buildLessonVocabPrompt({ lesson, words: resolveLessonWords(lesson) })
  );
  return saveVocabPack(user, lessonId, Array.isArray(out.items) ? out.items : []);
}

// Get the cached example-sentence pack, generating it on first view.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getLesson(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await getVocabPack(user, id);
  if (existing) return NextResponse.json({ pack: existing });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  try {
    return NextResponse.json({ pack: await generate(user, id) });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}

// Force a fresh pack (overwrites the cache).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  const { id } = await params;
  if (!getLesson(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json({ pack: await generate(user, id) });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
