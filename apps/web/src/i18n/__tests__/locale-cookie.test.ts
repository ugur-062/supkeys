// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { effectiveClientLocale, readLocaleCookie, writeLocaleCookie } from "../locale-cookie";

describe("dil çerezi", () => {
  it("yoksa null, yazınca okunur, bozuk değer null", () => {
    document.cookie = "NEXT_LOCALE=; Max-Age=0; Path=/";
    expect(readLocaleCookie()).toBeNull();
    expect(effectiveClientLocale()).toBe("tr");
    writeLocaleCookie("ru");
    expect(readLocaleCookie()).toBe("ru");
    expect(effectiveClientLocale()).toBe("ru");
    document.cookie = "NEXT_LOCALE=xx; Path=/";
    expect(readLocaleCookie()).toBeNull();
    document.cookie = "NEXT_LOCALE=; Max-Age=0; Path=/";
  });
});
