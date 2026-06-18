import { currentUser } from "@/lib/api-auth";
import { DEFAULT_LEVEL, type ChatMessage, type Level } from "@/lib/composition";
import { saveChat } from "@/lib/composition-store";

// Save (create or overwrite) a chat thread after an exchange. The reply text is
// streamed by /api/practice/chat; the client persists the running thread here.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string; title?: string; level?: Level; words?: string[]; messages?: ChatMessage[];
  };
  const messages = (body.messages ?? []).filter((m) => m.content?.trim());
  if (!messages.length) return Response.json({ error: "messages required" }, { status: 400 });

  const title = body.title?.trim() || messages[0].content.slice(0, 50);
  const thread = await saveChat(user, {
    id: body.id,
    title,
    level: body.level ?? DEFAULT_LEVEL,
    words: body.words ?? [],
    messages,
  });
  return Response.json({ thread });
}
