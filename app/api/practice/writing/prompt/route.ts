import { currentUser } from "@/lib/api-auth";
import { aiConfigured, generateJson } from "@/lib/ai";
import {
  buildWritingPromptPrompt,
  DEFAULT_LEVEL,
  DEFAULT_TENSE,
  WRITING_PROMPT_SCHEMA,
  type Level,
  type Tense,
  type WritingPromptResult,
} from "@/lib/composition";
import { createPrompt } from "@/lib/composition-store";
import { pickWords, sectionTitle } from "@/lib/practice-words";

// Generate a writing prompt (calibrated to level/tense/topic + optional section
// word bank), persist it, and return the saved row.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    level?: Level; tense?: Tense; topic?: string; unit?: number | null; section?: number | null;
  };
  const level = body.level ?? DEFAULT_LEVEL;
  const tense = body.tense ?? DEFAULT_TENSE;
  const topic = body.topic?.trim() || undefined;
  const words = body.unit != null ? await pickWords(body.unit, body.section ?? null) : [];

  try {
    const result = await generateJson<WritingPromptResult>(
      buildWritingPromptPrompt({ level, tense, topic, words }),
      WRITING_PROMPT_SCHEMA as unknown as Record<string, unknown>,
      { effort: "medium" }
    );
    const sectionLabel = await sectionTitle(body.unit ?? null, body.section ?? null);
    const row = await createPrompt(user, {
      level, tense,
      topic: result.topic ?? topic ?? sectionLabel ?? null,
      prompt: result.prompt,
      promptEn: result.prompt_en,
      words,
    });
    return Response.json({ prompt: row });
  } catch (err) {
    return Response.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
