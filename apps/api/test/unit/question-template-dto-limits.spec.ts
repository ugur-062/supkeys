import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { QUESTION_TEMPLATE_MAX_ITEMS, TEMPLATE_NAME_MAX_LENGTH } from "@rothern/shared";
import { SaveQuestionTemplateDto } from "../../src/modules/company-question-templates/dto/save-question-template.dto";

/**
 * Arayuz testi D-261 — soru seti ad/soru tavani web ile ayni sabitten okunur ve
 * 21. soru genel "en fazla 20 oge secilebilir" yerine soru setine ozgu metinle
 * reddedilir.
 */
const q = (i: number) => ({ text: `Soru ${i}`, answerType: "TEXT" });
const errorsFor = (body: object) => validateSync(plainToInstance(SaveQuestionTemplateDto, body) as object);

describe("SaveQuestionTemplateDto — tavanlar", () => {
  it("tavanda gecerli", () => {
    const items = Array.from({ length: QUESTION_TEMPLATE_MAX_ITEMS }, (_, i) => q(i));
    expect(errorsFor({ name: "x".repeat(TEMPLATE_NAME_MAX_LENGTH), items })).toEqual([]);
  });

  it("tavan asiminda alana ozgu mesaj", () => {
    const items = Array.from({ length: QUESTION_TEMPLATE_MAX_ITEMS + 1 }, (_, i) => q(i));
    const errors = errorsFor({ name: "x".repeat(TEMPLATE_NAME_MAX_LENGTH + 1), items });
    const msg = (prop: string) => Object.values(errors.find((e) => e.property === prop)?.constraints ?? {}).join(" ");
    expect(msg("items")).toMatch(new RegExp(`en fazla ${QUESTION_TEMPLATE_MAX_ITEMS} soru`));
    expect(msg("name")).toMatch(new RegExp(`en fazla ${TEMPLATE_NAME_MAX_LENGTH} karakter`));
  });
});
