import { currentUser } from "@/lib/api-auth";
import { aiConfigured, synthesizeSpeech } from "@/lib/ai";
import { getAudio, putAudio, keyFor } from "@/lib/audio-store";

// Text-to-speech for the Listening game and the listen-mode drills. Synthesizes
// Spanish audio with OpenAI TTS and returns WAV bytes the browser can play.
//
// Audio is persisted (Postgres bytea, or .data files when there's no DB),
// content-addressed by a hash of the text (keyFor), so each clip is synthesized
// once and replayed from storage thereafter — surviving reloads and restarts,
// like stories. See lib/audio-store.ts.

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const clean = (text ?? "").trim();
  if (!clean) return Response.json({ error: "text required" }, { status: 400 });

  const key = keyFor(clean);

  // Serve from storage if we've synthesized this text before.
  const cached = await getAudio(key);
  if (cached) return wav(cached, true);

  if (!aiConfigured()) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  try {
    const { audio } = await synthesizeSpeech(clean);
    await putAudio(key, audio); // persist for next time
    return wav(audio, false);
  } catch (err) {
    return Response.json({ error: String((err as Error).message ?? err) }, { status: 502 });
  }
}

function wav(audio: Buffer, cached: boolean): Response {
  return new Response(new Uint8Array(audio), {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "private, max-age=86400",
      "x-cache": cached ? "hit" : "miss",
    },
  });
}
