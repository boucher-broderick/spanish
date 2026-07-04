import { currentUser } from "@/lib/api-auth";
import { getKnownCards, getTodaysNewCards } from "@/lib/cards";

// Overview-table data for the Anki landing page: every started card (cards) plus
// today's upcoming new words (newToday) queued to be introduced today.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [cards, newToday] = await Promise.all([getKnownCards(), getTodaysNewCards()]);
  return Response.json({ cards, newToday });
}
