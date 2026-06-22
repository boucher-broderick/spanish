import { currentUser } from "@/lib/api-auth";
import { getKnownCards } from "@/lib/cards";

// Overview-table data: every started card (stage + name) for the Anki landing page.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ cards: await getKnownCards() });
}
