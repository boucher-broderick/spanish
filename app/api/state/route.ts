import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { loadState, saveState, type AppState } from "@/lib/store";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await loadState(user);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let data: AppState;
  try {
    data = (await req.json()) as AppState;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  await saveState(user, data);
  return NextResponse.json({ ok: true });
}
