import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { AnswerGrade, buildAnswerGradePrompt, DEFAULT_LEVEL, Level } from "@/lib/composition";
import { getStory } from "@/lib/composition-store";

// Grade a learner's open-ended quiz answers for a story (Reading + Listening).
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    storyId?: string;
    answers?: string[];
    level?: Level;
  };
  if (!body.storyId || !Array.isArray(body.answers)) {
    return NextResponse.json({ error: "storyId and answers are required" }, { status: 400 });
  }

  const story = await getStory(user, body.storyId);
  if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const qa = story.quiz.map((q, i) => ({
    question: q.question,
    reference: q.reference_answer,
    answer: body.answers![i] ?? "",
  }));

  try {
    const out = await generateJson<{ results: AnswerGrade[] }>(
      buildAnswerGradePrompt({ level: body.level ?? (story.level as Level) ?? DEFAULT_LEVEL, body: story.body, qa })
    );
    return NextResponse.json({ results: out.results ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
