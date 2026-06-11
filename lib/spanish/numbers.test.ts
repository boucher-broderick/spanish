import { describe, it, expect } from "vitest";
import { numberToSpanish } from "./numbers";

describe("numberToSpanish", () => {
  const cases: [number, string][] = [
    [0, "cero"],
    [1, "uno"],
    [15, "quince"],
    [16, "dieciséis"],
    [21, "veintiuno"],
    [22, "veintidós"],
    [30, "treinta"],
    [31, "treinta y uno"],
    [100, "cien"],
    [101, "ciento uno"],
    [215, "doscientos quince"],
    [500, "quinientos"],
    [999, "novecientos noventa y nueve"],
    [1000, "mil"],
    [2000, "dos mil"],
    [21000, "veintiún mil"],
    [100000, "cien mil"],
    [101000, "ciento un mil"],
    [1000000, "un millón"],
    [2000000, "dos millones"],
    [2500000, "dos millones quinientos mil"],
    [21000000, "veintiún millones"],
    [1000000000, "mil millones"],
  ];
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => expect(numberToSpanish(n)).toBe(expected));
  }
});
