import { currentUser } from "@/lib/api-auth";
import { getReviewCards, getNewCards, dailyAvailable } from "@/lib/cards";

// Today's study session: due reviews + the next new cards from the current section.
// The frontend interleaves the two lists. Single-user data; auth only gates access.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [reviews, newCards, dailyNewRemaining] = await Promise.all([
    getReviewCards(), getNewCards(), dailyAvailable(),
  ]);
  return Response.json({ reviews, newCards, dailyNewRemaining });
}
