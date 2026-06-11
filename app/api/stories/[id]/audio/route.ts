import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, synthesizeSpeech } from "@/lib/gemini";
import { getStory, getStoryAudio, setStoryAudio } from "@/lib/composition-store";

// Stream a story's narration. Synthesize-on-first-request, then cache the WAV in
// the DB so every later play is free. 501 tells the client to fall back to the
// browser's Web Speech API.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const story = await getStory(user, id);
  if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let audio = await getStoryAudio(user, id);
  if (!audio) {
    if (!geminiConfigured()) {
      return NextResponse.json({ error: "TTS not configured" }, { status: 501 });
    }
    try {
      const speech = await synthesizeSpeech(story.body);
      await setStoryAudio(user, id, speech.audio, speech.mime);
      audio = speech.audio;
    } catch (err) {
      return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 });
    }
  }

  return new NextResponse(new Uint8Array(audio), {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(audio.length),
      "cache-control": "private, max-age=31536000",
    },
  });
}
