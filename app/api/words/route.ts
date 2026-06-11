import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { loadWords } from "@/lib/store";

// Word dataset, served from Postgres (or the bundled file fallback). Auth-gated
// like /api/state; the client fetches this once on load (see WordsGate).
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const words = await loadWords();
  return NextResponse.json(words);
}
