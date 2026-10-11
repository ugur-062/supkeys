import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ExternalTenderInviteDto,
  InviteByEmailBatchDto,
  InviteByEmailDto,
} from "../../src/modules/company-connections/dto/invite-by-email.dto";

/**
 * Davet DTO'ları — geriye uyumlu dil alanları (2026-09-27): eski istemci düz
 * adres (`emails`), yeni istemci adres başına dil/ülke (`invites`) gönderir;
 * ikisinden biri ŞART (boş gövde doğrulamada 400 — rol matrisi e2e'si yetkili
 * rolde 400 bekler). Dil yalnız tr/en/ru; ülke ISO-2 büyük harf.
 */
async function errorsOf<T extends object>(cls: new () => T, body: unknown): Promise<string[]> {
  const errs = await validate(plainToInstance(cls, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const flat = (e: (typeof errs)[number]): string[] => [e.property, ...(e.children ?? []).flatMap(flat)];
  return errs.flatMap(flat);
}

describe("InviteByEmailBatchDto", () => {
  it("boş gövde reddedilir; emails ya da invites tek başına yeter", async () => {
    expect(await errorsOf(InviteByEmailBatchDto, {})).not.toHaveLength(0);
    expect(await errorsOf(InviteByEmailBatchDto, { emails: ["a@b.com"] })).toEqual([]);
    expect(await errorsOf(InviteByEmailBatchDto, { invites: [{ email: "a@b.kz", locale: "ru" }] })).toEqual([]);
    expect(await errorsOf(InviteByEmailBatchDto, { invites: [{ email: "a@b.com" }] })).toEqual([]);
  });

  it("desteklenmeyen dil ve bilinmeyen alan reddedilir", async () => {
    expect(await errorsOf(InviteByEmailBatchDto, { invites: [{ email: "a@b.de", locale: "de" }] })).toContain("locale");
    expect(await errorsOf(InviteByEmailBatchDto, { invites: [{ email: "a@b.de", foo: 1 }] })).toContain("foo");
  });
});

describe("InviteByEmailDto", () => {
  it("dil isteğe bağlı; yalnız tr/en/ru", async () => {
    expect(await errorsOf(InviteByEmailDto, { email: "a@b.com" })).toEqual([]);
    expect(await errorsOf(InviteByEmailDto, { email: "a@b.com", locale: "en" })).toEqual([]);
    expect(await errorsOf(InviteByEmailDto, { email: "a@b.com", locale: "zh" })).toContain("locale");
  });
});

describe("ExternalTenderInviteDto", () => {
  it("eski gövde (emails) ve yeni gövde (invites + dil + ülke) geçer; ikisi de yoksa ret", async () => {
    expect(await errorsOf(ExternalTenderInviteDto, { listingId: "l1", emails: ["a@b.com"] })).toEqual([]);
    expect(
      await errorsOf(ExternalTenderInviteDto, {
        listingId: "l1",
        invites: [{ email: "einkauf@firma.de", locale: "en", country: "DE" }],
      }),
    ).toEqual([]);
    expect(await errorsOf(ExternalTenderInviteDto, { listingId: "l1" })).not.toHaveLength(0);
  });

  it("ülke ISO-2 büyük harf olmalı", async () => {
    expect(
      await errorsOf(ExternalTenderInviteDto, { listingId: "l1", invites: [{ email: "a@b.de", country: "de" }] }),
    ).toContain("country");
  });
});

/**
 * Yayın denetimi 2026-09-28 Bölüm 5: iki alanın `ValidateIf` koşulu birbirine
 * `=== undefined` ile bakıyordu → `{ emails: [...], invites: null }` iki alanın
 * da TÜM doğrulamasını atlatıyor, tek istek sınırsız adrese e-posta attırıyordu.
 * Kural: GÖNDERİLEN alan (null dahil) her zaman doğrulanır.
 */
describe("davet DTO'ları — ValidateIf atlatması", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `a${i}@x.com`);

  it("toplu davet: `invites: null` emails doğrulamasını KAPATMAZ (tavan + biçim)", async () => {
    expect(await errorsOf(InviteByEmailBatchDto, { emails: many(51), invites: null })).not.toHaveLength(0);
    expect(await errorsOf(InviteByEmailBatchDto, { emails: ["adres-degil"], invites: null })).not.toHaveLength(0);
    expect(await errorsOf(InviteByEmailBatchDto, { emails: many(20000), invites: null })).toContain("emails");
  });

  it("toplu davet: `emails: null` invites doğrulamasını KAPATMAZ; iki alan birden gönderilirse ikisi de doğrulanır", async () => {
    expect(
      await errorsOf(InviteByEmailBatchDto, { invites: many(51).map((email) => ({ email })), emails: null }),
    ).not.toHaveLength(0);
    expect(
      await errorsOf(InviteByEmailBatchDto, { emails: [], invites: many(60).map((email) => ({ email })) }),
    ).not.toHaveLength(0);
    expect(await errorsOf(InviteByEmailBatchDto, { emails: ["a@b.com"], invites: [{ email: "x" }] })).not.toHaveLength(0);
  });

  it("toplu davet: yalnız null gövdeler reddedilir, geçerli tek alan yine geçer", async () => {
    expect(await errorsOf(InviteByEmailBatchDto, { emails: null, invites: null })).not.toHaveLength(0);
    expect(await errorsOf(InviteByEmailBatchDto, { emails: many(50) })).toEqual([]);
    expect(await errorsOf(InviteByEmailBatchDto, { invites: many(50).map((email) => ({ email })) })).toEqual([]);
  });

  it("dış talep daveti: `invites: null` 60 tavanını ve tip denetimini KAPATMAZ", async () => {
    expect(await errorsOf(ExternalTenderInviteDto, { listingId: "l1", emails: many(61), invites: null })).not.toHaveLength(0);
    expect(await errorsOf(ExternalTenderInviteDto, { listingId: "l1", emails: [42], invites: null })).not.toHaveLength(0);
    expect(
      await errorsOf(ExternalTenderInviteDto, { listingId: "l1", invites: [{ email: "a@b.de", country: "germany" }], emails: null }),
    ).not.toHaveLength(0);
  });
});
