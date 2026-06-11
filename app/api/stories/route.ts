import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import {
  buildStoryPrompt,
  CompTense,
  DEFAULT_LENGTH,
  DEFAULT_LEVEL,
  DEFAULT_TENSE,
  Level,
  lengthWords,
  StoryLengthId,
  StoryResult,
} from "@/lib/composition";
import { createStory, listStories } from "@/lib/composition-store";
import { randomSpice } from "@/lib/spice";

// List all stories (newest first). Audio bytes are not included — just a flag.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ stories: await listStories(user) });
}

// Generate a new story + open-ended quiz and save it.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    level?: Level;
    tense?: CompTense;
    topic?: string;
    length?: StoryLengthId;
  };
  const level = body.level ?? DEFAULT_LEVEL;
  const tense = body.tense ?? DEFAULT_TENSE;
  const length = body.length ?? DEFAULT_LENGTH;
  const topic = body.topic?.trim() || undefined;

  try {
    const result = await generateJson<StoryResult>(
      buildStoryPrompt({ level, tense, topic, words: lengthWords(length), spice: randomSpice() }),
      { timeoutMs: 120_000 }
    );
    const story = await createStory(user, {
      title: result.title,
      topic: result.topic ?? topic ?? null,
      level,
      tense,
      length,
      body: result.body,
      quiz: Array.isArray(result.questions) ? result.questions : [],
    });
    return NextResponse.json({ story });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
