import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildGradePrompt, CompTense, DEFAULT_LEVEL, DEFAULT_TENSE, Level, WritingGrade } from "@/lib/composition";
import { addWritingAttempt } from "@/lib/composition-store";

// Grade a writing attempt against its prompt, then save it as a new variation.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    promptId?: string;
    prompt?: string;
    body?: string;
    level?: Level;
    tense?: CompTense;
  };
  if (!body.promptId || !body.body?.trim() || !body.prompt) {
    return NextResponse.json({ error: "promptId, prompt and body are required" }, { status: 400 });
  }

  try {
    const grade = await generateJson<WritingGrade>(
      buildGradePrompt({
        level: body.level ?? DEFAULT_LEVEL,
        tense: body.tense ?? DEFAULT_TENSE,
        prompt: body.prompt,
        body: body.body,
      })
    );
    const attempt = await addWritingAttempt(user, body.promptId, body.body, grade);
    if (!attempt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    return NextResponse.json({ attempt });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
