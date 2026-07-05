// Server-only AI client (text, JSON, streaming chat, and TTS) over the OpenAI
// REST API. No SDK dependency — keeps the app lean. A single OPENAI_API_KEY
// powers text and audio. Exposes the surface the routes expect: generateText,
// generateJson(prompt, schema, opts), streamChat(messages, opts),
// synthesizeSpeech(text), and aiConfigured().
import "server-only";

const BASE = "https://api.openai.com/v1";

export const TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "nova";

// Salt for the audio cache key: bump (via voice/model change) to invalidate
// clips synthesized by a previous provider/voice so old and new never mix.
export const AUDIO_KEY_SALT = `openai:${TTS_MODEL}:${TTS_VOICE}`;

export function aiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set");
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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Assemble chat messages from an optional system prompt + turns. */
function buildMessages(system: string | undefined, turns: ChatMessage[]): ChatMessage[] {
  return system ? [{ role: "system", content: system }, ...turns] : turns;
}

interface ChatBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "json_object" };
}

/** One non-streaming chat completion → the assistant message text. */
async function chat(body: ChatBody, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${body.model} ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

/** Plain text generation. */
export async function generateText(prompt: string, opts: GenOpts = {}): Promise<string> {
  return chat(
    {
      model: opts.model ?? TEXT_MODEL,
      messages: buildMessages(opts.system, [{ role: "user", content: prompt }]),
      temperature: opts.temperature ?? 0.9,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    },
    opts.timeoutMs ?? 60_000
  );
}

// Tolerant JSON extraction: strips code fences and slices the outermost braces.
function extractJson<T>(raw: string): T {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model reply");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Structured JSON generation. JSON mode is requested and the schema is appended
 *  to the prompt for shape guidance; tolerant parse + one repair retry. */
export async function generateJson<T>(prompt: string, schema: Record<string, unknown>, opts: GenOpts = {}): Promise<T> {
  const full = `${prompt}\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(schema)}`;
  const raw = await chat(
    {
      model: opts.model ?? TEXT_MODEL,
      messages: buildMessages(opts.system, [{ role: "user", content: full }]),
      temperature: opts.temperature ?? 0.8,
      response_format: { type: "json_object" },
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    },
    opts.timeoutMs ?? 90_000
  );
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

/** Streamed multi-turn chat (SSE). Returns a ReadableStream of UTF-8 text
 *  deltas, suitable for a Response body. */
export function streamChat(messages: ChatTurn[], opts: GenOpts = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const body: ChatBody = {
    model: opts.model ?? TEXT_MODEL,
    messages: buildMessages(opts.system, messages.map((m) => ({ role: m.role, content: m.content }))),
    temperature: opts.temperature ?? 0.9,
    stream: true,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  };

  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`OpenAI ${body.model} ${res.status}: ${text.slice(0, 300)}`);
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
              const text = parsed?.choices?.[0]?.delta?.content ?? "";
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
// OpenAI's /audio/speech returns a ready-to-play audio container directly
// (we ask for WAV), so no manual PCM→WAV wrapping is needed.
export interface Speech { audio: Buffer; mime: "audio/wav" }

/** Transient failures worth retrying: rate limit (429) and 5xx. */
function isTransient(err: unknown): boolean {
  return /\b(429|500|502|503|504)\b/.test((err as Error)?.message ?? "");
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function synthesizeSpeech(text: string, voice = TTS_VOICE): Promise<Speech> {
  const body = { model: TTS_MODEL, voice, input: text, response_format: "wav" };
  const backoffs = [600, 1800, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120_000);
      let res: Response;
      try {
        res = await fetch(`${BASE}/audio/speech`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenAI TTS ${res.status}: ${errText.slice(0, 300)}`);
      }
      const audio = Buffer.from(await res.arrayBuffer());
      return { audio, mime: "audio/wav" };
    } catch (err) {
      lastErr = err;
      if (attempt < backoffs.length && isTransient(err)) { await sleep(backoffs[attempt]); continue; }
      throw err;
    }
  }
  throw lastErr;
}
