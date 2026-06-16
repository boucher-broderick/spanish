import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateJson } from "@/lib/gemini";
import { buildChatTurnPrompt, type ChatReply } from "@/lib/composition";
import { appendChatTurns, getChat, getExplanation } from "@/lib/course-store";
import { getLesson } from "@/lib/curriculum";

// Full chat history for a lesson.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getLesson(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ messages: await getChat(user, id) });
}

// One chat turn: append the student's message, ask the teacher, append the reply.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  try {
    const [explanation, history] = await Promise.all([getExplanation(user, id), getChat(user, id)]);
    const reply = await generateJson<ChatReply>(
      buildChatTurnPrompt({ lesson, explanation: explanation?.body ?? null, history, userMessage: message.trim() })
    );
    const messages = await appendChatTurns(user, id, [
      { role: "user", content: message.trim() },
      { role: "model", content: reply.reply },
    ]);
    return NextResponse.json({ messages, suggestPractice: reply.suggestPractice ?? null });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}
