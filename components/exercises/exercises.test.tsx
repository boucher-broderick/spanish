// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Word } from "@/lib/domain";
import { Spelling } from "./Spelling";
import { Conjugation } from "./Conjugation";
import { FillSentence } from "./FillSentence";

afterEach(cleanup);

const verb: Word = {
  id: "verb-hablar",
  rank: 1,
  categoryRank: 1,
  category: "Verbs",
  pos: "verb",
  spanish: "hablar",
  english: "to speak",
  lemma: "hablar",
  article: null,
  gender: null,
  verbGroup: "ar",
};

describe("Spelling (accent-sensitive)", () => {
  it("marks an accent-only miss as incorrect", () => {
    const onResult = vi.fn();
    const word = { ...verb, lemma: "él", english: "he", pos: "pronoun" };
    render(<Spelling word={word} onResult={onResult} />);
    fireEvent.change(screen.getByPlaceholderText("español…"), { target: { value: "el" } });
    fireEvent.click(screen.getByText("Check"));
    expect(screen.getByText(/Accents count/i)).toBeDefined();
    fireEvent.click(screen.getByText("Next"));
    expect(onResult).toHaveBeenCalledWith(false);
  });
  it("accepts the exact spelling", () => {
    const onResult = vi.fn();
    const word = { ...verb, lemma: "casa", english: "house", pos: "noun" };
    render(<Spelling word={word} onResult={onResult} />);
    fireEvent.change(screen.getByPlaceholderText("español…"), { target: { value: "casa" } });
    fireEvent.click(screen.getByText("Check"));
    fireEvent.click(screen.getByText("Next"));
    expect(onResult).toHaveBeenCalledWith(true);
  });
});

describe("FillSentence (accent-tolerant)", () => {
  it("accepts an answer ignoring accents", () => {
    const onResult = vi.fn();
    render(
      <FillSentence
        word={{ ...verb, english: "year", lemma: "año", spanish: "el año", pos: "noun" }}
        sentence={{ englishSentence: "x", spanishCloze: "El próximo ____ viajo.", clozeAnswer: "año" }}
        onResult={onResult}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("palabra…"), { target: { value: "ano" } });
    fireEvent.click(screen.getByText("Check"));
    fireEvent.click(screen.getByText("Next"));
    expect(onResult).toHaveBeenCalledWith(true);
  });
});

describe("Conjugation (all-or-nothing)", () => {
  it("is correct only when every shown box is right", () => {
    const onResult = vi.fn();
    render(<Conjugation word={verb} tenses={["present"]} onResult={onResult} />);
    const inputs = document.querySelectorAll("input");
    // 5 shown persons for one tense
    expect(inputs.length).toBe(5);
    const forms = ["hablo", "hablas", "habla", "hablamos", "hablan"];
    forms.forEach((f, i) => fireEvent.change(inputs[i], { target: { value: f } }));
    fireEvent.click(screen.getByText("Check card"));
    expect(screen.getByText(/Whole card correct/i)).toBeDefined();
    fireEvent.click(screen.getByText("Next verb"));
    expect(onResult).toHaveBeenCalledWith(true);
  });
  it("marks the card wrong if one box is off", () => {
    const onResult = vi.fn();
    render(<Conjugation word={verb} tenses={["present"]} onResult={onResult} />);
    const inputs = document.querySelectorAll("input");
    const forms = ["hablo", "hablas", "habla", "hablamos", "WRONG"];
    forms.forEach((f, i) => fireEvent.change(inputs[i], { target: { value: f } }));
    fireEvent.click(screen.getByText("Check card"));
    fireEvent.click(screen.getByText("Next verb"));
    expect(onResult).toHaveBeenCalledWith(false);
  });
});
