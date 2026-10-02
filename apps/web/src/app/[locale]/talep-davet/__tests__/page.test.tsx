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
    // Sayfa hatayı kendi kartında gösterir → global toast kapalı (D-058).
    expect(h.get).toHaveBeenCalledWith("/public/invite-preview", { params: { ref: "TOK123", l: "l1" }, skipErrorToast: true });
    expect(h.post).toHaveBeenCalledWith("/public/referral-visit", { token: "TOK123" }, { skipErrorToast: true });
    // Görünen etiket <dt>; aynı etiket ikinci kez (sr-only) okunmaz (D-337).
    expect(screen.getAllByText(/Son teklif tarihi/)).toHaveLength(1);
    expect(screen.getByText(/Son teklif tarihi/).tagName).toBe("DT");
    // Etiket + değer tek cümle gibi satır içi akar; değer dar sütuna sıkışmaz
    // (yeniden doğrulama: RU'da tarih 5 satıra bölünüyordu).
    for (const id of ["invite-meta-deadline", "invite-meta-delivery"]) {
      const row = screen.getByTestId(id);
      expect(row.className).not.toMatch(/\bflex\b/);
      const dt = row.querySelector("dt")!;
      const dd = row.querySelector("dd")!;
      expect(dt.className).toMatch(/\binline\b/);
      expect(dt.className).not.toMatch(/shrink-0/);
      expect(dd.className).toMatch(/\binline\b/);
    }
    expect(screen.getByTestId("invite-meta-deadline").querySelector("dd")!.textContent).toBe(preview.closesAt);
    expect(screen.getByText("Kayıt olmak ve teklif vermek ücretsizdir.", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem("rothern:invite-prefill")).toContain("info@firma.com"));
  });

  it("kayıtlı adres giriş CTA'sı talebe döner", async () => {
    h.get.mockResolvedValue({ data: { ...preview, accepted: true } });
    render(<Page />);
    const cta = await screen.findByRole("link", { name: "Giriş yap ve teklif ver" });
    expect(cta.getAttribute("href")).toContain(encodeURIComponent("/company/ilan/l1"));
  });

  it("kapalı talep: teklif çağrısı ve kapalı talebe dönüş yok (O-117)", async () => {
    h.get.mockResolvedValue({ data: { ...preview, closed: true } });
    render(<Page />);
    expect(await screen.findByText("Bu talep teklife kapandı")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ücretsiz kaydol ve teklif ver" })).toBeNull();
    const cta = screen.getByRole("link", { name: "Ücretsiz kaydol" });
    expect(cta.getAttribute("href")).toContain("ref=TOK123");
    expect(cta.getAttribute("href")).not.toContain("redirect=");
    expect(screen.queryByText(/teklif vermek ücretsizdir/)).toBeNull();
    expect(screen.getByText("Benzer taleplerden haberdar olmak için ücretsiz kaydolabilirsiniz.")).toBeInTheDocument();
  });

  it("kapalı talep, kayıtlı adres: düz giriş, talebe dönüş yok", async () => {
    h.get.mockResolvedValue({ data: { ...preview, accepted: true, closed: true } });
    render(<Page />);
    const cta = await screen.findByRole("link", { name: "Giriş yap" });
    expect(cta.getAttribute("href")).not.toContain("next=");
    expect(screen.getByText("Benzer talepleri görmek için giriş yapın.")).toBeInTheDocument();
    expect(screen.queryByText(/ücretsiz kaydolabilirsiniz/)).toBeNull();
  });

  it("geçersiz bağlantı", async () => {
    h.get.mockRejectedValue(new Error("404"));
    render(<Page />);
    expect(await screen.findByText("Davet bulunamadı")).toBeInTheDocument();
  });
});
