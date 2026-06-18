import { describe, it, expect } from "vitest";
import { normalize, grade } from "./grade";

describe("normalize", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalize("  Yo   Preparo ")).toBe("yo preparo");
  });
  it("strips surrounding punctuation but keeps inner", () => {
    expect(normalize("¿Vive?")).toBe("vive");
    expect(normalize("Yo preparo la cena.")).toBe("yo preparo la cena");
  });
  it("preserves accents and ñ", () => {
    expect(normalize("compró")).toBe("compró");
    expect(normalize("niños")).toBe("niños");
  });
});

describe("grade", () => {
  it("exact word match", () => {
    expect(grade("vive", ["vive"])).toBe("correct");
  });
  it("wrong conjugation is incorrect", () => {
    expect(grade("vivo", ["vive"])).toBe("incorrect");
  });
  it("accents are significant", () => {
    expect(grade("compro", ["compró"])).toBe("incorrect");
    expect(grade("compró", ["compró"])).toBe("correct");
  });
  it("normalizes case/space/punctuation on full sentences", () => {
    expect(grade("  yo preparo la cena ", ["Yo preparo la cena."])).toBe("correct");
  });
  it("accepts any of multiple answers", () => {
    expect(grade("no escucho música clásica", [
      "Escucho música clásica desde hace… años.",
      "No escucho música clásica.",
    ])).toBe("correct");
  });
  it("empty input or no answers => empty", () => {
    expect(grade("", ["vive"])).toBe("empty");
    expect(grade("algo", [])).toBe("empty");
  });
});
