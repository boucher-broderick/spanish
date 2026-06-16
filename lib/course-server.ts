// Server-side helpers for Course routes. The runtime word array (lib/words.ts) is
// normally populated client-side by WordsGate; on the server we lazily install it
// from the same source (DB or bundled file) so resolveLessonWords() yields real
// Spanish/English for prompt building. Node-only.
import "server-only";
import { loadWords } from "./store";
import { initWords, wordsLoaded } from "./words";

export async function ensureWords(): Promise<void> {
  if (!wordsLoaded()) initWords(await loadWords());
}
