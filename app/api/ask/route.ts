import { currentUser } from "@/lib/api-auth";
import { aiConfigured, streamChat, type ChatTurn } from "@/lib/ai";
import { helpSystemPrompt } from "@/lib/composition";

// Help panel ("ask an LLM if I'm confused"). Streams a tutor answer in English.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[]; context?: string };
  const messages = (body.messages ?? []).filter((m) => m.content?.trim()).slice(-20);
  if (!messages.length) return Response.json({ error: "messages required" }, { status: 400 });

  const stream = streamChat(messages, { system: helpSystemPrompt(body.context), effort: "low", maxTokens: 1500 });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
