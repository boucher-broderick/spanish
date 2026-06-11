import { describe, it, expect } from "vitest";
import { dateToSpanish, dateToEnglish } from "./dates";

describe("dateToSpanish", () => {
  it("Tue 2026-06-09 → martes, nueve de junio", () => {
    expect(dateToSpanish(new Date(2026, 5, 9))).toBe("martes, nueve de junio");
  });
  it("Mon 2025-12-01 → lunes, uno de diciembre", () => {
    expect(dateToSpanish(new Date(2025, 11, 1))).toBe("lunes, uno de diciembre");
  });
  it("spells the day in words (23)", () => {
    expect(dateToSpanish(new Date(2026, 2, 23))).toBe("lunes, veintitrés de marzo");
  });
});

describe("dateToEnglish", () => {
  it("Tue 2026-06-09 → Tuesday, June 9", () => {
    expect(dateToEnglish(new Date(2026, 5, 9))).toBe("Tuesday, June 9");
  });
});
