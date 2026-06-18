import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import {
  buildGradePrompt,
  DEFAULT_LEVEL,
  DEFAULT_TENSE,
  WRITING_GRADE_SCHEMA,
  type Level,
  type Tense,
  type WritingGrade,
} from "@/lib/composition";
import { addWritingAttempt } from "@/lib/composition-store";

// Grade a writing attempt against its prompt, then save it as an attempt.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    promptId?: string; prompt?: string; body?: string; level?: Level; tense?: Tense;
  };
  if (!body.promptId || !body.prompt || !body.body?.trim()) {
    return Response.json({ error: "promptId, prompt and body are required" }, { status: 400 });
  }

  try {
    const grade = await generateJson<WritingGrade>(
      buildGradePrompt({
        level: body.level ?? DEFAULT_LEVEL,
        tense: body.tense ?? DEFAULT_TENSE,
        prompt: body.prompt,
        body: body.body,
      }),
      WRITING_GRADE_SCHEMA as unknown as Record<string, unknown>,
      { effort: "medium" }
    );
    const attempt = await addWritingAttempt(user, body.promptId, body.body, grade);
    if (!attempt) return Response.json({ error: "Prompt not found" }, { status: 404 });
    return Response.json({ attempt });
  } catch (err) {
    return Response.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
