// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  SIGNUP_INTENTS,
  consumeSignupIntent,
  parseSignupIntent,
  rememberSignupIntent,
} from "./signup-intent";

describe("kayıt niyeti", () => {
  beforeEach(() => sessionStorage.clear());
  it("yalnız tanınan niyetler geçer", () => {
    expect(parseSignupIntent("talep")).toBe("talep");
    expect(parseSignupIntent("hack")).toBeNull();
    expect(parseSignupIntent(null)).toBeNull();
  });
  it("hatırla → tüket: hedef rota döner ve silinir", () => {
    rememberSignupIntent("vitrin");
    expect(consumeSignupIntent()).toBe(SIGNUP_INTENTS.vitrin.href);
    expect(consumeSignupIntent()).toBeNull();
  });
  it("redirect niyet hedefinden önce gelir, dış adres yok sayılır", () => {
    rememberSignupIntent("teklif", "/talep/rot-000001-x");
    expect(consumeSignupIntent()).toBe("/talep/rot-000001-x");
    rememberSignupIntent("teklif", "https://kotu.example");
    expect(consumeSignupIntent()).toBe(SIGNUP_INTENTS.teklif.href);
  });
  it("'ikisi de' hedef üretmez — panel varsayılanı", () => {
    rememberSignupIntent("ikisi");
    expect(consumeSignupIntent()).toBeNull();
  });
});
