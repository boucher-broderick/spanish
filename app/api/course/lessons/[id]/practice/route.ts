import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildPracticePrompt } from "@/lib/composition";
import type { PracticeItem, PracticeKind, PracticeSpec } from "@/lib/course";
import { PRACTICE_KINDS } from "@/lib/course";
import { getLatestSpec, saveSpec } from "@/lib/course-store";
import { getLesson, resolveLessonWords } from "@/lib/curriculum";
import { ensureWords } from "@/lib/course-server";
import { randomSpice } from "@/lib/spice";

const VALID_KINDS = new Set(PRACTICE_KINDS.map((k) => k.id));

// The most recently generated spec (or null).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getLesson(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ spec: await getLatestSpec(user, id) });
}

// Generate a fresh drill of the requested kind (the callable "tool").
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { kind?: PracticeKind; count?: number };
  const kind = body.kind && VALID_KINDS.has(body.kind) ? body.kind : "fillBlank";
  const count = Math.min(Math.max(body.count ?? (kind === "writingPrompt" ? 1 : 8), 1), 12);

  try {
    await ensureWords();
    const raw = await generateJson<{ title?: string; instructions?: string; items?: PracticeItem[] }>(
      buildPracticePrompt({ lesson, words: resolveLessonWords(lesson), kind, count, spice: randomSpice() })
    );
    const items = (raw.items ?? []).map((it, i) => ({ ...it, id: it.id || `i${i + 1}` }));
    if (!items.length) return NextResponse.json({ error: "Model returned no items" }, { status: 502 });
    const spec: PracticeSpec = {
      lessonId: id,
      kind,
      title: raw.title || lesson.title,
      instructions: raw.instructions || "",
      items,
    };
    await saveSpec(user, id, spec);
    return NextResponse.json({ spec });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
