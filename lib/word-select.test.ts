import { describe, expect, it } from "vitest";
import { poolFor, selectWords, shuffle } from "./word-select";
import type { VocabUnit } from "./book";

// Two units, each with a couple of sections, enough words to exceed the max pick.
const UNITS: VocabUnit[] = [
  {
    unit: 1,
    title: "Unit One",
    sections: [
      {
        title: "S1", page: 1,
        verbs: Array.from({ length: 8 }, (_, i) => ({ es: `verbo${i}`, en: "v" })),
        nouns: Array.from({ length: 8 }, (_, i) => ({ es: `nombre${i}`, en: "n" })),
        adjectives: [], adverbs: [], expressions: [],
      },
      {
        title: "S2", page: 2,
        verbs: Array.from({ length: 6 }, (_, i) => ({ es: `andar${i}`, en: "v" })),
        nouns: [], adjectives: [], adverbs: [], expressions: [],
      },
    ],
  },
  {
    unit: 2,
    title: "Unit Two",
    sections: [
      {
        title: "S1", page: 3,
        verbs: [{ es: "ser", en: "to be" }], nouns: [], adjectives: [], adverbs: [], expressions: [],
      },
    ],
  },
];

describe("poolFor", () => {
  it("scopes to a single section when unit+section given", () => {
    const pool = poolFor(UNITS, 1, 0);
    expect(pool).toHaveLength(16); // 8 verbs + 8 nouns
    expect(pool).toContain("verbo0");
    expect(pool).not.toContain("andar0"); // from S2
  });

  it("scopes to a whole unit when section is null", () => {
    expect(poolFor(UNITS, 1, null)).toHaveLength(22); // 16 + 6
  });

  it("spans all units when unit is null", () => {
    expect(poolFor(UNITS, null, null)).toHaveLength(23); // 22 + 1
  });

  it("dedupes repeated word forms", () => {
    const dup: VocabUnit[] = [{
      unit: 9, title: "Dup", sections: [{
        title: "x", page: 1,
        verbs: [{ es: "hablar", en: "a" }, { es: "hablar", en: "b" }],
        nouns: [], adjectives: [], adverbs: [], expressions: [],
      }],
    }];
    expect(poolFor(dup, 9, 0)).toEqual(["hablar"]);
  });
});

describe("selectWords", () => {
  it("returns 10–20 words from a large-enough pool", () => {
    for (let i = 0; i < 50; i++) {
      const picked = selectWords(UNITS, 1, null); // pool of 22
      expect(picked.length).toBeGreaterThanOrEqual(10);
      expect(picked.length).toBeLessThanOrEqual(20);
      expect(new Set(picked).size).toBe(picked.length); // unique
    }
  });

  it("never exceeds the available pool", () => {
    const picked = selectWords(UNITS, 2, 0); // only 1 word available
    expect(picked).toEqual(["ser"]);
  });

  it("only returns words from the requested scope", () => {
    const picked = selectWords(UNITS, 1, 0);
    for (const w of picked) expect(/^(verbo|nombre)\d$/.test(w)).toBe(true);
  });
});

describe("shuffle", () => {
  it("preserves the multiset of elements", () => {
    const out = shuffle([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
