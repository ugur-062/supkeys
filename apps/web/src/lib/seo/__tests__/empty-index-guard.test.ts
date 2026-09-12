import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchProducts = vi.fn();
const fetchPublicDirectory = vi.fn();
const fetchListings = vi.fn();
vi.mock("@/lib/public/marketplace-api", () => ({
  fetchProducts: (...a: unknown[]) => fetchProducts(...a),
  fetchPublicDirectory: (...a: unknown[]) => fetchPublicDirectory(...a),
  fetchListings: (...a: unknown[]) => fetchListings(...a),
}));

const { dizinBos } = await import("../empty-index-guard");

describe("boş dizin koruması", () => {
  beforeEach(() => {
    fetchProducts.mockReset();
    fetchPublicDirectory.mockReset();
    fetchListings.mockReset();
  });

  it("kayıt yokken noindex ister", async () => {
    fetchProducts.mockResolvedValue({ total: 0 });
    expect(await dizinBos("urunler")).toBe(true);
  });

  it("kayıt varken indekslenebilir kalır", async () => {
    fetchPublicDirectory.mockResolvedValue({ total: 3 });
    expect(await dizinBos("firmalar")).toBe(false);
  });

  it("API patlarsa İNDEKSLENEBİLİR kalır (geçici hata kalıcı SEO kaybına dönüşmesin)", async () => {
    fetchListings.mockRejectedValue(new Error("ağ"));
    expect(await dizinBos("talepler")).toBe(false);
  });
});
