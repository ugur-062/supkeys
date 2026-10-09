import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchListing = vi.fn();
vi.mock("@/lib/public/marketplace-api", () => ({
  fetchListing: (n: string) => fetchListing(n),
}));

const { resolveListingPage, similarListingsSegment } = await import("./listing-page");

const listing = (over: Record<string, unknown> = {}) => ({
  number: "ROT-000057",
  type: "ALIM",
  title: "ABB Şalt Malzeme",
  ...over,
});

describe("resolveListingPage", () => {
  beforeEach(() => {
    fetchListing.mockReset();
  });

  it("numara taşımayan slug'da API'ye HİÇ gitmez", async () => {
    const res = await resolveListingPage("celik-boru", "ALIM");
    expect(res).toEqual({ kind: "notFound" });
    // Boşuna istek atmak, botun ürettiği her uydurma yolu API'ye taşırdı.
    expect(fetchListing).not.toHaveBeenCalled();
  });

  it("kayıt yoksa 404", async () => {
    fetchListing.mockResolvedValue(null);
    expect(await resolveListingPage("rot-1-x", "ALIM")).toEqual({
      kind: "notFound",
    });
  });

  it("kanonik slug'da doğrudan gösterir", async () => {
    fetchListing.mockResolvedValue(listing());
    const res = await resolveListingPage("rot-000057-abb-salt-malzeme", "ALIM");
    expect(res.kind).toBe("ok");
  });

  it("başlık değişmişse kanonik adrese yönlendirir", async () => {
    fetchListing.mockResolvedValue(listing());
    const res = await resolveListingPage("rot-000057-eski-baslik", "ALIM");
    expect(res).toEqual({
      kind: "redirect",
      to: "/talep/rot-000057-abb-salt-malzeme",
    });
  });

  it("API slug verdiyse kanonik ondan gelir — çevrilmiş başlık adresi DEĞİŞTİRMEZ (i18n Faz 1e)", async () => {
    // EN yanıtı: başlık çevrilmiş, slug kaynak (Türkçe) başlığın slug'ı.
    fetchListing.mockResolvedValue(listing({ title: "ABB Switchgear", slug: "rot-000057-abb-salt-malzeme" }));
    expect((await resolveListingPage("rot-000057-abb-salt-malzeme", "ALIM")).kind).toBe("ok");
    expect(await resolveListingPage("rot-000057-abb-switchgear", "ALIM")).toEqual({
      kind: "redirect",
      to: "/talep/rot-000057-abb-salt-malzeme",
    });
  });

  it("ALIM kaydı /talep altında kalır", async () => {
    fetchListing.mockResolvedValue(listing({ type: "ALIM", title: "Boru" }));
    expect((await resolveListingPage("rot-000057-boru", "ALIM")).kind).toBe("ok");
  });

  it("numarayı büyük harfe çevirip sorar (URL küçük harfli)", async () => {
    fetchListing.mockResolvedValue(listing());
    await resolveListingPage("rot-000057-abb-salt-malzeme", "ALIM");
    expect(fetchListing).toHaveBeenCalledWith("ROT-000057");
  });
});

// 2026-10-09 (sahip kararı): gizli segmentteki eski talebin sayfasında "benzer
// açık talepler" gizli kodla sorulmaz — API o kodu süzgeçsiz sayar, blok
// ilgisiz talepleri "benzer" diye gösterirdi.
describe("similarListingsSegment", () => {
  it("ilk GÖRÜNÜR kategori kodunun segmenti", () => {
    expect(similarListingsSegment(["39121600"])).toBe("39000000");
    expect(similarListingsSegment(["46181500", "31161500", "39121600"])).toBe("31000000");
    expect(similarListingsSegment(["bozuk", "40141700"])).toBe("40000000");
  });

  it("görünür kategorisi olmayan talepte null — blok çizilmez, gizli kod sorguya girmez", () => {
    expect(similarListingsSegment(["46181500"])).toBeNull();
    expect(similarListingsSegment(["46181500", "77101500", "10000000"])).toBeNull();
    expect(similarListingsSegment([])).toBeNull();
    expect(similarListingsSegment(undefined)).toBeNull();
  });
});
