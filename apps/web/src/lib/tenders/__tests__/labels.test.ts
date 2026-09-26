import { describe, expect, it } from "vitest";
import { CURRENCY_SYMBOL } from "../labels";

describe("etiketler", () => {
  it("CURRENCY_SYMBOL temel birimleri içerir", () => {
    expect(CURRENCY_SYMBOL.TRY).toBe("₺");
    expect(CURRENCY_SYMBOL.USD).toBe("$");
    expect(CURRENCY_SYMBOL.EUR).toBe("€");
  });
});
