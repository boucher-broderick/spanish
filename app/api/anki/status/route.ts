import { currentUser } from "@/lib/api-auth";
import { getSessionSummary } from "@/lib/cards";

// End-of-session summary + the lock-until-tomorrow signal. The frontend shows the
// summary screen (and blocks further study) when `locked` is true.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await getSessionSummary());
}
