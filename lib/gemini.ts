// Server-only Gemini client (text, JSON, and TTS) over the public
// generativelanguage v1beta REST API. No SDK dependency — keeps the app lean
// and matches the project's minimal-deps style. Auth is a single API key
// (GEMINI_API_KEY); the same key powers text and TTS.
import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
export const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

interface GenOpts {
  system?: string;
  temperature?: number;
  json?: boolean; // ask the model for application/json
  model?: string;
  timeoutMs?: number;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function callGenerate(body: unknown, model: string, timeoutMs: number): Promise<GeminiPart[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${model} ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error(`Gemini ${model}: no candidates returned`);
  return (cand.content?.parts ?? []) as GeminiPart[];
}

// Plain text generation.
export async function generateText(prompt: string, opts: GenOpts = {}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.9,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const parts = await callGenerate(body, opts.model ?? TEXT_MODEL, opts.timeoutMs ?? 60_000);
  return parts.map((p) => p.text ?? "").join("").trim();
}

// Tolerant JSON extraction: strips code fences and slices the outermost braces.
export function extractJson<T>(raw: string): T {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model reply");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

// JSON generation with one repair retry if the first parse fails.
export async function generateJson<T>(prompt: string, opts: GenOpts = {}): Promise<T> {
  const raw = await generateText(prompt, { ...opts, json: true, temperature: opts.temperature ?? 0.8 });
  try {
    return extractJson<T>(raw);
  } catch {
    // One retry at low temperature, re-asking for strict JSON.
    const raw2 = await generateText(
      `${prompt}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object, no prose, no code fences.`,
      { ...opts, json: true, temperature: 0 }
    );
    return extractJson<T>(raw2);
  }
}

// ---- Text-to-speech ----
// Gemini TTS returns raw PCM (audio/L16). We wrap it in a WAV container so the
// browser <audio> element can play it directly.
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export interface Speech {
  audio: Buffer; // WAV bytes
  mime: "audio/wav";
}

export async function synthesizeSpeech(text: string, voice = TTS_VOICE): Promise<Speech> {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  const parts = await callGenerate(body, TTS_MODEL, 120_000);
  const inline = parts.find((p) => p.inlineData)?.inlineData;
  if (!inline) throw new Error("Gemini TTS: no audio returned");
  const pcm = Buffer.from(inline.data, "base64");
  // mimeType looks like "audio/L16;codec=pcm;rate=24000" — pull the rate out.
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000);
  return { audio: pcmToWav(pcm, rate), mime: "audio/wav" };
}
