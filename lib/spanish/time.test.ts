import { describe, it, expect } from "vitest";
import { acceptedTimeAnswers, timeCanonical, englishTimePhrase } from "./time";

describe("timeCanonical (traditional)", () => {
  const cases: [number, number, string][] = [
    [3, 15, "son las tres y cuarto"],
    [3, 30, "son las tres y media"],
    [3, 45, "son las cuatro menos cuarto"],
    [1, 0, "es la una en punto"],
    [8, 10, "son las ocho y diez"],
    [5, 37, "son las seis menos veintitrés"],
    [12, 45, "es la una menos cuarto"],
  ];
  for (const [h, m, expected] of cases) {
    it(`${h}:${String(m).padStart(2, "0")} → ${expected}`, () =>
      expect(timeCanonical({ hour: h, minute: m })).toBe(expected));
  }
});

describe("acceptedTimeAnswers (number mode accepts both)", () => {
  it("3:45 accepts numeric and traditional", () => {
    const ok = acceptedTimeAnswers({ hour: 3, minute: 45 });
    expect(ok).toContain("son las tres y cuarenta y cinco");
    expect(ok).toContain("son las cuatro menos cuarto");
  });
  it("1:00 accepts plain and en punto", () => {
    const ok = acceptedTimeAnswers({ hour: 1, minute: 0 });
    expect(ok).toContain("es la una");
    expect(ok).toContain("es la una en punto");
  });
});

describe("englishTimePhrase", () => {
  const cases: [number, number, string][] = [
    [5, 30, "half past five"],
    [5, 45, "quarter to six"],
    [5, 0, "five o'clock"],
    [5, 23, "twenty-three minutes past five"],
    [5, 37, "twenty-three minutes to six"],
  ];
  for (const [h, m, expected] of cases) {
    it(`${h}:${String(m).padStart(2, "0")} → ${expected}`, () =>
      expect(englishTimePhrase({ hour: h, minute: m })).toBe(expected));
  }
});
