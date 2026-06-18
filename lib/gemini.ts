// Server-only Gemini client (text, JSON, streaming chat, and TTS) over the
// public generativelanguage v1beta REST API. No SDK dependency — keeps the app
// lean. A single GEMINI_API_KEY powers text and audio. Exposes the same surface
// the routes expect: generateJson(prompt, schema, opts), streamChat(messages,
// opts), and geminiConfigured().
import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Effort is a Claude concept; accepted and ignored here so call sites don't churn.
interface GenOpts {
  system?: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  effort?: string;
}

interface GeminiPart { text?: string; inlineData?: { mimeType: string; data: string } }

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

/** Plain text generation. */
export async function generateText(prompt: string, opts: GenOpts = {}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.9,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const parts = await callGenerate(body, opts.model ?? TEXT_MODEL, opts.timeoutMs ?? 60_000);
  return parts.map((p) => p.text ?? "").join("").trim();
}

// Tolerant JSON extraction: strips code fences and slices the outermost braces.
function extractJson<T>(raw: string): T {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model reply");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Structured JSON generation. The schema is appended to the prompt and JSON
 *  mode is requested; tolerant parse + one repair retry. */
export async function generateJson<T>(prompt: string, schema: Record<string, unknown>, opts: GenOpts = {}): Promise<T> {
  const full = `${prompt}\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(schema)}`;
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: full }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      responseMimeType: "application/json",
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  const parts = await callGenerate(body, opts.model ?? TEXT_MODEL, opts.timeoutMs ?? 90_000);
  const raw = parts.map((p) => p.text ?? "").join("");
  try {
    return extractJson<T>(raw);
  } catch {
    const retry = await generateText(
      `${full}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object.`,
      { ...opts, temperature: 0 }
    );
    return extractJson<T>(retry);
  }
}

/** Streamed multi-turn chat via streamGenerateContent (SSE). Returns a
 *  ReadableStream of UTF-8 text deltas, suitable for a Response body. */
export function streamChat(messages: ChatTurn[], opts: GenOpts = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const model = opts.model ?? TEXT_MODEL;
  const body: Record<string, unknown> = {
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.9,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`Gemini ${model} ${res.status}: ${text.slice(0, 300)}`);
        }
        const reader = res.body.getReader();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE events are separated by blank lines; each has a `data:` line.
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json);
              const text = (parsed?.candidates?.[0]?.content?.parts ?? [])
                .map((p: GeminiPart) => p.text ?? "")
                .join("");
              if (text) controller.enqueue(encoder.encode(text));
            } catch { /* skip partial/non-JSON keepalive lines */ }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ---- Text-to-speech ----
// Gemini TTS returns raw PCM (audio/L16). Wrap it in a WAV container so the
// browser <audio> element can play it directly.
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export interface Speech { audio: Buffer; mime: "audio/wav" }

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
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000);
  return { audio: pcmToWav(pcm, rate), mime: "audio/wav" };
}
