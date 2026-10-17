import { YES_NO_ANSWER_VALUES } from "@rothern/shared";
import { describe, expect, it } from "vitest";
import { YES_NO_STORED, yesNoAnswerLabel } from "../yes-no-answer";

// Derin denetim LU-21: YES_NO cevabı sabit veri değeriyle saklanır, alıcıya
// kendi dilinde gösterilir.
describe("yesNoAnswerLabel", () => {
  const labels = { yes: "Yes", no: "No" };

  it("saklanan değer teklif formunun yazdığıyla aynı", () => {
    expect(YES_NO_STORED).toBe(YES_NO_ANSWER_VALUES);
  });

  it("saklanan Evet/Hayır okuyucunun diline çevrilir", () => {
    expect(yesNoAnswerLabel(YES_NO_ANSWER_VALUES.yes, labels)).toBe("Yes");
    expect(yesNoAnswerLabel(YES_NO_ANSWER_VALUES.no, labels)).toBe("No");
  });

  it("tanınmayan değer aynen döner", () => {
    expect(yesNoAnswerLabel("Belki", labels)).toBe("Belki");
  });
});
