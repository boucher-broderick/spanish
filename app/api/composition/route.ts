import { currentUser } from "@/lib/api-auth";
import {
  deleteChat,
  deletePrompt,
  deleteStory,
  listChats,
  listStories,
  listWriting,
} from "@/lib/composition-store";

// Saved LLM-game content for the game landing screens.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [stories, writing, chats] = await Promise.all([listStories(user), listWriting(user), listChats(user)]);
  return Response.json({ stories, writing, chats });
}

// Delete a saved item: DELETE /api/composition?type=story|writing|chat&id=...
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  if (!id || !type) return Response.json({ error: "type and id required" }, { status: 400 });
  if (type === "story") await deleteStory(user, id);
  else if (type === "writing") await deletePrompt(user, id);
  else if (type === "chat") await deleteChat(user, id);
  else return Response.json({ error: "unknown type" }, { status: 400 });
  return Response.json({ ok: true });
}
