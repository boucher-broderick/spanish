import { NextResponse } from "next/server";
import { currentUser } from "@/lib/api-auth";
import { geminiConfigured, generateText } from "@/lib/gemini";
import { ensureWords } from "@/lib/course-server";
import { WORDS } from "@/lib/words";
import { foldAccents } from "@/lib/text";

// Quick word/phrase definitions for double-click-to-define. Tries the bundled word
// dataset first (free, instant), then falls back to a tiny Gemini gloss. Both are
// cached in-process so repeated lookups are cheap.
const cache = new Map<string, string>();
let lemmaMap: Map<string, string> | null = null;

function norm(s: string): string {
  return foldAccents(s.toLowerCase())
    .replace(/[^a-zñ\s]/gi, " ")
    .replace(/^(el|la|los|las|un|una|unos|unas)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function datasetLookup(word: string): Promise<string | null> {
  await ensureWords();
  if (!lemmaMap) {
    lemmaMap = new Map();
    for (const w of WORDS) {
      for (const form of [w.lemma, w.spanish]) {
        const n = norm(form);
        if (n && !lemmaMap.has(n)) lemmaMap.set(n, w.english);
      }
    }
  }
  return lemmaMap.get(norm(word)) ?? null;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const word = (text ?? "").trim();
  if (!word || word.length > 60) return NextResponse.json({ definition: null });

  const key = norm(word);
  if (cache.has(key)) return NextResponse.json({ definition: cache.get(key) });

  const ds = await datasetLookup(word);
  if (ds) {
    cache.set(key, ds);
    return NextResponse.json({ definition: ds });
  }

  if (!geminiConfigured()) return NextResponse.json({ definition: null });
  try {
    const out = await generateText(
      `Give a very short English meaning (a few words, not a sentence) for the Spanish word or phrase "${word}". If it is a conjugated verb, give the infinitive and meaning (e.g. "tener — to have"). Reply with ONLY the meaning.`,
      { temperature: 0 }
    );
    const clean = out.trim().replace(/^["']|["']$/g, "").slice(0, 120);
    cache.set(key, clean);
    return NextResponse.json({ definition: clean });
  } catch {
    return NextResponse.json({ definition: null });
  }
}
