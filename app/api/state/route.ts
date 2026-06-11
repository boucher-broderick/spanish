import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { loadProgress, saveProgress } from "@/lib/store";
import { ProgressState } from "@/lib/domain";

async function currentUser(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await loadProgress(user);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let data: ProgressState;
  try {
    data = (await req.json()) as ProgressState;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  await saveProgress(user, data);
  return NextResponse.json({ ok: true });
}
