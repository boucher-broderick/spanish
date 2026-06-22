import { currentUser } from "@/lib/api-auth";
import { getOverview } from "@/lib/srs-store";

// Landing-screen data: upcoming new words + today's reviews + the future schedule.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await getOverview(user));
}
