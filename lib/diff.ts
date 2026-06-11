// Word-level alignment for the listening "transcribe" exercise. Compares the
// learner's transcription against the original story and marks each word as
// correct, substituted, missing, or extra (classic WER alignment). Accents are
// significant — dictation should reward getting them right — but surrounding
// punctuation and case are ignored.
export type DiffOp = "equal" | "sub" | "del" | "ins";
export interface DiffSeg {
  op: DiffOp;
  ref?: string; // word from the original (reference)
  hyp?: string; // word the learner typed (hypothesis)
}

export function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function norm(w: string): string {
  // strip leading/trailing non-alphanumerics, lowercase; keep accents + ñ.
  return w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// Levenshtein alignment over tokens with backtrace.
export function diffWords(ref: string, hyp: string): DiffSeg[] {
  const r = tokenize(ref);
  const h = tokenize(hyp);
  const rn = r.map(norm);
  const hn = h.map(norm);
  const n = r.length;
  const m = h.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = rn[i - 1] === hn[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const out: DiffSeg[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (rn[i - 1] === hn[j - 1] ? 0 : 1)) {
      out.push(rn[i - 1] === hn[j - 1] ? { op: "equal", ref: r[i - 1], hyp: h[j - 1] } : { op: "sub", ref: r[i - 1], hyp: h[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      out.push({ op: "del", ref: r[i - 1] }); // in original, learner missed it
      i--;
    } else {
      out.push({ op: "ins", hyp: h[j - 1] }); // learner added extra
      j--;
    }
  }
  return out.reverse();
}

export interface DiffStats {
  correct: number;
  total: number; // reference word count
  accuracy: number; // correct / total
}
export function diffStats(segs: DiffSeg[]): DiffStats {
  const total = segs.filter((s) => s.op !== "ins").length;
  const correct = segs.filter((s) => s.op === "equal").length;
  return { correct, total, accuracy: total ? correct / total : 0 };
}
