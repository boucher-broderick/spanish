import { currentUser } from "@/lib/api-auth";
import { ensureAudio } from "@/lib/audio-store";

// Pre-generate TTS audio for a batch of Spanish strings so playback is instant
// when the learner reaches the answer reveal. Called by the study UI right after
// a session is pulled (for both new AND review cards). Each clip is checked
// against the persistent store first and synthesized only on a miss, so this is
// a cheap no-op for anything already generated. Fire-and-forget from the client;
// never blocks the study flow. See lib/audio-store.ts (ensureAudio).

const MAX_TEXTS = 400;   // safety cap on a single batch
const CONCURRENCY = 2;   // keep well under the free-tier TTS per-minute rate limit

/** Run `worker` over `items` with at most `n` in flight at once. */
async function pool<T>(items: T[], n: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { texts?: unknown };
  const texts = Array.isArray(body.texts)
    ? [...new Set(body.texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0))].slice(0, MAX_TEXTS)
    : [];
  if (!texts.length) return Response.json({ ok: true, generated: 0 });

  let ready = 0;
  await pool(texts, CONCURRENCY, async (t) => {
    if (await ensureAudio(t)) ready++;
  });
  return Response.json({ ok: true, requested: texts.length, ready });
}
