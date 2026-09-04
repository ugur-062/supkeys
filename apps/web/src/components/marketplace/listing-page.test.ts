import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchListing = vi.fn();
vi.mock("@/lib/public/marketplace-api", () => ({
  fetchListing: (n: string) => fetchListing(n),
}));

const { resolveListingPage } = await import("./listing-page");

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
