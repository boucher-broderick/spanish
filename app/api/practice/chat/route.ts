import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, streamChat, type ChatTurn } from "@/lib/gemini";
import { chatSystemPrompt, DEFAULT_LEVEL, type Level } from "@/lib/composition";

// Spanish conversation game (Chat). Streams a reply in Spanish at the chosen
// level, optionally steered toward the section's words. Persistence of the
// thread is handled client-side via /api/composition/chat.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!geminiConfigured()) return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[]; level?: Level; words?: string[] };
  const messages = (body.messages ?? []).filter((m) => m.content?.trim()).slice(-30);
  if (!messages.length) return Response.json({ error: "messages required" }, { status: 400 });

  const system = chatSystemPrompt({ level: body.level ?? DEFAULT_LEVEL, words: body.words });
  const stream = streamChat(messages, { system, effort: "low", maxTokens: 800 });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
