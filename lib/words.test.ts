import { describe, it, expect, beforeAll } from "vitest";
import { Category, Word } from "./domain";
import { initWords, wordsByGroup, groupCount, groupSetIndex, wordById } from "./words";

const mk = (id: string, category: Category, rank: number): Word => ({
  id, rank, categoryRank: rank, category, pos: category.toLowerCase(),
  spanish: id, english: id, lemma: id, article: null, gender: null, verbGroup: null,
});

describe("runtime word store", () => {
  beforeAll(() => {
    initWords([
      mk("n1", "Nouns", 1),
      mk("v1", "Verbs", 2),
      mk("adj1", "Adjectives", 3),
      mk("adv1", "Adverbs", 4),
    ]);
  });

  it("groups non-noun/verb categories into Other", () => {
    expect(wordsByGroup("Other").map((w) => w.id)).toEqual(["adj1", "adv1"]);
    expect(wordsByGroup("Nouns").map((w) => w.id)).toEqual(["n1"]);
    expect(wordsByGroup("Verbs").map((w) => w.id)).toEqual(["v1"]);
  });

  it("counts per group and looks up by id", () => {
    expect(groupCount("Other")).toBe(2);
    expect(wordById("v1")?.category).toBe("Verbs");
  });

  it("set index is 0 within the first 20 of a group", () => {
    expect(groupSetIndex(mk("adj1", "Adjectives", 3))).toBe(0);
  });
});
