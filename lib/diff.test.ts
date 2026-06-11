import { describe, it, expect } from "vitest";
import { diffWords, diffStats, tokenize } from "./diff";

describe("diffWords", () => {
  it("marks an exact match all-equal", () => {
    const segs = diffWords("el gato negro", "el gato negro");
    expect(segs.every((s) => s.op === "equal")).toBe(true);
    expect(diffStats(segs)).toMatchObject({ correct: 3, total: 3, accuracy: 1 });
  });

  it("ignores case and surrounding punctuation", () => {
    const segs = diffWords("Hola, mundo.", "hola mundo");
    expect(segs.every((s) => s.op === "equal")).toBe(true);
  });

  it("treats accents as significant", () => {
    const segs = diffWords("el bebé", "el bebe");
    const ops = segs.map((s) => s.op);
    expect(ops).toContain("sub");
    expect(diffStats(segs).correct).toBe(1);
  });

  it("detects a missing (del) word", () => {
    const segs = diffWords("el gato negro", "el negro");
    expect(segs.find((s) => s.op === "del")?.ref).toBe("gato");
    expect(diffStats(segs)).toMatchObject({ correct: 2, total: 3 });
  });

  it("detects an extra (ins) word", () => {
    const segs = diffWords("el gato", "el gato grande");
    expect(segs.find((s) => s.op === "ins")?.hyp).toBe("grande");
    expect(diffStats(segs).total).toBe(2);
  });

  it("tokenizes on whitespace", () => {
    expect(tokenize("  uno  dos\ttres ")).toEqual(["uno", "dos", "tres"]);
  });
});
