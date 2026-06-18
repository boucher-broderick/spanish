// Read a text/plain streaming Response body, invoking `onChunk` for each decoded
// delta. Client-safe (plain function). Used by the Chat game and help panel.
export async function readTextStream(res: Response, onChunk: (text: string) => void): Promise<void> {
  if (!res.body) {
    onChunk(await res.text());
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) onChunk(tail);
}
