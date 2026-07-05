import { currentUser } from "@/lib/api-auth";
import { aiConfigured, generateJson } from "@/lib/ai";
import {
  buildStoryPrompt,
  DEFAULT_LENGTH,
  DEFAULT_LEVEL,
  DEFAULT_TENSE,
  lengthWords,
  STORY_SCHEMA,
  type Level,
  type StoryLengthId,
  type StoryResult,
  type Tense,
} from "@/lib/composition";
import { createStory } from "@/lib/composition-store";
import { pickWords } from "@/lib/practice-words";

// Generate a Spanish story + comprehension quiz (used by both Reading and
// Listening), weaving in the chosen section's words, then persist it.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    level?: Level; tense?: Tense; topic?: string; length?: StoryLengthId; unit?: number | null; section?: number | null;
  };
  const level = body.level ?? DEFAULT_LEVEL;
  const tense = body.tense ?? DEFAULT_TENSE;
  const length = body.length ?? DEFAULT_LENGTH;
  const topic = body.topic?.trim() || undefined;
  const words = body.unit != null ? await pickWords(body.unit, body.section ?? null) : [];

  try {
    const result = await generateJson<StoryResult>(
      buildStoryPrompt({ level, tense, topic, words: lengthWords(length), include: words }),
      STORY_SCHEMA as unknown as Record<string, unknown>,
      { effort: "medium", maxTokens: 6000 }
    );
    const story = await createStory(user, {
      title: result.title,
      topic: result.topic ?? topic ?? null,
      level, tense, length,
      body: result.body,
      quiz: Array.isArray(result.questions) ? result.questions : [],
      words,
    });
    return Response.json({ story });
  } catch (err) {
    return Response.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
