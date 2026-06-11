import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { deleteWritingPrompt } from "@/lib/composition-store";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteWritingPrompt(user, id);
  return NextResponse.json({ ok: true });
}
