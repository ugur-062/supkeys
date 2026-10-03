import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@rothern/i18n";
import { describe, expect, it } from "vitest";
import { routing } from "../routing";

describe("routing — dil çerezi", () => {
  it("next-intl dil çerezi Türkçe bağlantının elle yazdığıyla aynı süreli (arayüz testi D-315)", () => {
    expect(routing.localeCookie).toMatchObject({ name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE });
  });
});
