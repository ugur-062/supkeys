// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "../page";

/**
 * KAYITSIZ TALEP ÖNİZLEMESİ (2026-09-27, Faz 3): davet eden firma + tüm
 * kalemler + son tarih/teslim yeri; kayıt bağlantısı jetonu ve talebe dönüşü
 * taşır; açılış önceden doldurma bilgisini saklar; geçersiz bağlantı kartı.
 */
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), params: new URLSearchParams("ref=TOK123&l=l1") }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.params }));

const preview = {
  listingId: "l1",
  closed: false,
  accepted: false,
  inviterName: "ABC İnşaat",
  tenderTitle: "Bağlantı elemanları",
  tenderNumber: "ROT-000042",
  categories: ["Cıvatalar"],
  closesAt: "5 Ekim 2026 01:30 GMT+3",
  items: [
    { name: "M6 cıvata", quantity: 500, unitCode: "PCE", unit: "adet" },
    { name: "M8 somun", quantity: 300, unitCode: "PCE", unit: "adet" },
  ],
  itemCount: 2,
  deliveryPlace: "İzmir, Türkiye",
  supplierTypes: [],
};

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset().mockResolvedValue({ data: { email: "info@firma.com", companyName: "Firma", website: null, country: "TR", city: null } });
  sessionStorage.clear();
});

describe("Talep davet önizlemesi", () => {
  it("davet eden, kalemler, son tarih; kayıt bağlantısı jeton + talebe dönüş taşır; önceden doldurma saklanır", async () => {
    h.get.mockResolvedValue({ data: preview });
    render(<Page />);
    expect(await screen.findByText("ABC İnşaat sizden teklif istiyor")).toBeInTheDocument();
    expect(screen.getByText("M6 cıvata")).toBeInTheDocument();
    expect(screen.getByText("500 adet")).toBeInTheDocument();
    expect(screen.getByText("İzmir, Türkiye")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Ücretsiz kaydol ve teklif ver" });
    expect(cta.getAttribute("href")).toContain("ref=TOK123");
    expect(cta.getAttribute("href")).toContain(encodeURIComponent("/company/ilan/l1"));
    expect(h.get).toHaveBeenCalledWith("/public/invite-preview", { params: { ref: "TOK123", l: "l1" } });
    await waitFor(() => expect(sessionStorage.getItem("rothern:invite-prefill")).toContain("info@firma.com"));
  });

  it("kayıtlı adres giriş CTA'sı; kapalı talep notu", async () => {
    h.get.mockResolvedValue({ data: { ...preview, accepted: true, closed: true } });
    render(<Page />);
    expect(await screen.findByRole("link", { name: "Giriş yap ve teklif ver" })).toBeInTheDocument();
    expect(screen.getByText("Bu talep teklife kapandı")).toBeInTheDocument();
  });

  it("geçersiz bağlantı", async () => {
    h.get.mockRejectedValue(new Error("404"));
    render(<Page />);
    expect(await screen.findByText("Davet bulunamadı")).toBeInTheDocument();
  });
});
