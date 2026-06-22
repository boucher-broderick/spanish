import { currentUser } from "@/lib/api-auth";
import { pickWords, sectionTitle } from "@/lib/practice-words";

// Resolve 10–20 random words for a unit/section selection. Used by the Chat
// game to fix its word bank up front (so it stays consistent across turns).
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { unit?: number | null; section?: number | null };
  const unit = body.unit ?? null;
  const section = body.section ?? null;
  const words = unit != null ? await pickWords(unit, section) : [];
  return Response.json({ words, sectionTitle: await sectionTitle(unit, section) });
}
