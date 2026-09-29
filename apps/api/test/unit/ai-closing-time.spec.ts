import { parseClosingInstant, sanitizeAiDraft } from "../../src/modules/ai/tender-extract/ai-draft-sanitizer";
import { assistantClockContext } from "../../src/modules/ai/assistant/assistant.prompts";

/**
 * Derin denetim MU-07 — AI kapanis tarihi urun saat dilimiyle (Europe/Istanbul)
 * okunur; asistan istemine bugunun tarihi girer.
 */
describe("parseClosingInstant", () => {
  it("yalniz gun → o gunun 23:59'u Istanbul (UTC gece yarisi / TR 03:00 degil)", () => {
    expect(parseClosingInstant("2026-10-30")?.toISOString()).toBe("2026-10-30T20:59:00.000Z");
  });

  it("ofsetsiz tarih-saat → Istanbul duvar saati (sunucunun UTC saati degil)", () => {
    expect(parseClosingInstant("2026-10-05T14:00")?.toISOString()).toBe("2026-10-05T11:00:00.000Z");
    expect(parseClosingInstant("2026-10-05T14:00:30")?.toISOString()).toBe("2026-10-05T11:00:30.000Z");
    expect(parseClosingInstant("2026-10-05 14:00")?.toISOString()).toBe("2026-10-05T11:00:00.000Z");
  });

  it("ofsetli / Z ISO oldugu gibi okunur", () => {
    expect(parseClosingInstant("2026-10-05T14:00:00+03:00")?.toISOString()).toBe("2026-10-05T11:00:00.000Z");
    expect(parseClosingInstant("2026-10-05T14:00:00.000Z")?.toISOString()).toBe("2026-10-05T14:00:00.000Z");
  });

  it("takvim disi ya da bozuk deger → null", () => {
    expect(parseClosingInstant("2026-02-31")).toBeNull();
    expect(parseClosingInstant("2026-10-05T25:00")).toBeNull();
    expect(parseClosingInstant("yarin")).toBeNull();
  });
});

describe("sanitizeAiDraft bidsCloseAt", () => {
  const future = new Date(Date.now() + 10 * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(future);

  it("yalniz gun kapanis Istanbul gun sonuna cevrilir", () => {
    const s = sanitizeAiDraft({ bidsCloseAt: day }, "refine");
    expect(s.draft.bidsCloseAt).toBe(`${day}T20:59:00.000Z`);
  });

  it("bugunun tarihi (yalniz gun) gecmis sayilip silinmez — gun sonu gelecekte", () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    const s = sanitizeAiDraft({ bidsCloseAt: today }, "refine");
    // 23:59 Istanbul'dan sonra calisirsa (gece yarisina bir dakika) gecmistir.
    const endOfToday = parseClosingInstant(today)!;
    if (endOfToday.getTime() > Date.now()) expect(s.draft.bidsCloseAt).toBe(endOfToday.toISOString());
  });

  it("sanitizer ciktisi tekrar sanitize edilince degismez (idempotent)", () => {
    const once = sanitizeAiDraft({ bidsCloseAt: day }, "refine").draft.bidsCloseAt;
    const twice = sanitizeAiDraft({ bidsCloseAt: once }, "refine").draft.bidsCloseAt;
    expect(twice).toBe(once);
  });
});

describe("assistantClockContext", () => {
  it("Istanbul duvar saatiyle bugunun tarihini, gununu ve dilimi yazar", () => {
    const ctx = assistantClockContext(new Date("2026-09-29T21:30:00.000Z"));
    // UTC 21:30 = Istanbul ertesi gun 00:30 (gun kaymasi Istanbul'a gore).
    expect(ctx).toContain("CURRENT DATE/TIME: 2026-09-30 00:30 (Wednesday)");
    expect(ctx).toContain("Europe/Istanbul (UTC+03:00)");
    expect(ctx).toContain("YYYY-MM-DD");
  });
});
