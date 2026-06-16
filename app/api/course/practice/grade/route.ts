import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildPracticeGradePrompt, type GradeRequestItem } from "@/lib/composition";
import type { ItemResult } from "@/lib/course";

// Batched free-form grading for translate / short-answer / corrections / reasons.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const { items } = (await req.json().catch(() => ({}))) as { items?: GradeRequestItem[] };
  if (!items?.length) return NextResponse.json({ results: [] });

  try {
    const out = await generateJson<{ results: ItemResult[] }>(buildPracticeGradePrompt({ items }));
    return NextResponse.json({ results: out.results ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
