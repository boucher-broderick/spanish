import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { listWritingPrompts } from "@/lib/composition-store";

// List all writing prompts with their attempts (variations).
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ prompts: await listWritingPrompts(user) });
}
