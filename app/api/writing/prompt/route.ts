import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildWritingPromptPrompt, CompTense, DEFAULT_LEVEL, DEFAULT_TENSE, Level, WritingPromptResult } from "@/lib/composition";
import { createWritingPrompt } from "@/lib/composition-store";
import { randomSpice } from "@/lib/spice";

// Generate a fresh writing prompt and persist it so retries (variations) attach to it.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    level?: Level;
    tense?: CompTense;
    topic?: string;
    words?: string[];
  };
  const level = body.level ?? DEFAULT_LEVEL;
  const tense = body.tense ?? DEFAULT_TENSE;
  const topic = body.topic?.trim() || undefined;
  const include = Array.isArray(body.words) && body.words.length ? body.words : undefined;

  try {
    const result = await generateJson<WritingPromptResult>(
      buildWritingPromptPrompt({ level, tense, topic, spice: randomSpice(), include })
    );
    const row = await createWritingPrompt(user, {
      level,
      tense,
      topic: result.topic ?? topic ?? null,
      prompt: result.prompt,
      promptEn: result.prompt_en ?? null,
    });
    return NextResponse.json({ prompt: row });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
