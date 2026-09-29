// @vitest-environment jsdom
/**
 * Doğrulama Belgeleri (2026-09-10): durum rozeti tek kaynaktan; PENDING/
 * VERIFIED'da kimlik alanları kilitli; MERSİS/IBAN satır içi hata backend
 * submit() ile aynı; yabancı firmada MERSİS yok, belge etiketleri Türkçe.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  submit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
}));
vi.mock("@/hooks/use-company-docs", async (orig) => {
  const real = await orig<typeof import("@/hooks/use-company-docs")>();
  return {
    ...real,
    useCompanyDocs: () => ({ data: h.data, isLoading: false }),
    useUploadDoc: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSubmitDocs: () => ({ mutateAsync: h.submit, isPending: false }),
  };
});

import DogrulamaPage from "../page";

const TR_DOCS = ["taxPlate", "tradeRegistry", "signatureCircular", "activityCert", "idFront", "idBack"];
function docs(over: Record<string, unknown> = {}) {
  const none = Object.fromEntries(TR_DOCS.map((k) => [k, null]));
  const pending = Object.fromEntries(TR_DOCS.map((k) => [k, "PENDING"]));
  return {
    status: "UNVERIFIED",
    verifiedAt: null,
    rejectionReason: null,
    country: "TR",
    docs: none,
    docStatus: pending,
    docReason: none,
    required: TR_DOCS,
    revisions: none,
    mersisNo: null,
    tradeRegistryNo: null,
    iban: null,
    ibanHolder: null,
    ...over,
  };
}

describe("DogrulamaPage", () => {
  beforeEach(() => {
    h.submit.mockReset();
    h.data = docs();
  });

  it("UNVERIFIED: 'Belge bekleniyor' rozeti, alanlar açık, eksik listesi Gönder'i kapatır", () => {
    render(<DogrulamaPage />);
    expect(screen.getByText("Belge bekleniyor")).toBeInTheDocument();
    expect(screen.getByLabelText("MERSİS No *")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Doğrulamaya Gönder" })).toBeDisabled();
    expect(screen.getByText(/MERSİS No \(16 hane\)/)).toBeInTheDocument();
  });

  it.each(["PENDING", "VERIFIED"])("%s: kimlik alanları kilitli, Gönder yok", (status) => {
    h.data = docs({ status, mersisNo: "1234567890123456" });
    render(<DogrulamaPage />);
    expect(screen.getByLabelText("MERSİS No *")).toBeDisabled();
    expect(screen.getByLabelText("IBAN *")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Doğrulamaya Gönder" })).not.toBeInTheDocument();
  });

  it("MERSİS 16 hane değilse ve IBAN kontrol hanesi tutmuyorsa satır içi hata", async () => {
    const user = userEvent.setup();
    render(<DogrulamaPage />);
    await user.type(screen.getByLabelText("MERSİS No *"), "12345");
    expect(await screen.findByText("MERSİS No 16 haneli olmalı")).toBeInTheDocument();
    await user.type(screen.getByLabelText("IBAN *"), "TR330006100519786457841327");
    expect(await screen.findByText(/kontrol hanesi tutmuyor/)).toBeInTheDocument();
  });

  // Derin denetim S056: belge yüklemesi company-docs'u tazeler; yeni yanıt
  // (yeni presigned URL) gönderilmemiş KYC alanlarını sıfırlamamalı.
  it("belge yükleme sonrası refetch gönderilmemiş KYC alanlarını ezmez", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DogrulamaPage />);
    await user.type(screen.getByLabelText("MERSİS No *"), "1234567890123456");
    await user.type(screen.getByLabelText("Hesap Sahibi *"), "Acme");
    // Yükleme sonrası yeni referanslı yanıt: belge durumu değişti, KYC aynı (null).
    h.data = docs({ docs: { ...docs().docs, taxPlate: "https://s3/new-url" } });
    rerender(<DogrulamaPage />);
    expect(screen.getByLabelText("MERSİS No *")).toHaveValue("1234567890123456");
    expect(screen.getByLabelText("Hesap Sahibi *")).toHaveValue("Acme");
    // Sunucu değeri GERÇEKTEN değişirse (gönderim sonrası) alan onu alır.
    h.data = docs({ mersisNo: "6543210987654321" });
    rerender(<DogrulamaPage />);
    expect(screen.getByLabelText("MERSİS No *")).toHaveValue("6543210987654321");
  });

  it("SWIFT: boşluklu yapıştırma kesilmez, boşluk atılır ve büyük harfe çevrilir", async () => {
    const user = userEvent.setup();
    render(<DogrulamaPage />);
    const box = screen.getByLabelText(/^SWIFT/) as HTMLInputElement;
    await user.click(box);
    await user.paste("deut de ff 500");
    expect(box.value).toBe("DEUTDEFF500");
  });

  it("yabancı firma: MERSİS alanı yok, belge etiketleri Türkçe + İngilizce", () => {
    h.data = docs({
      country: "KZ",
      required: ["tradeRegistry", "taxPlate", "idFront"],
    });
    render(<DogrulamaPage />);
    expect(screen.queryByLabelText("MERSİS No *")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Kuruluş \/ Sicil Belgesi/).length).toBeGreaterThanOrEqual(1);
    // 2026-09-14: "yurt dışında opsiyonel" KALKTI — zorunluluk evrensel,
    // değişen yalnız biçim. MERSİS Türkiye'ye özgü olduğu için ÇİZİLMEZ
    // (opsiyonel değil, o ülkede karşılığı yok); sicil ve banka alanları
    // yıldızlı ve "Gönder" onlarsız açılmaz.
    expect(screen.getByText("Doğrulama Bilgileri")).toBeInTheDocument();
    expect(screen.queryByText(/opsiyonel/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sicil / Kayıt No *")).toBeInTheDocument();
    expect(screen.getByLabelText("Hesap Sahibi *")).toBeInTheDocument();
  });

  // 2026-09-27: red gerekçesi "[KOD] not" biçiminde saklanır; kod firmanın
  // dilinde katalogdan, not olduğu gibi basılır. Kodsuz eski metin aynen.
  it("kodlu red gerekçesi katalogdan çevrilir, admin notu eklenir; eski metin aynen", () => {
    h.data = docs({
      status: "REJECTED",
      rejectionReason: "[COUNTRY_CHANGED]",
      docStatus: { ...docs().docStatus, taxPlate: "REJECTED", tradeRegistry: "REJECTED" },
      docReason: {
        ...docs().docReason,
        taxPlate: "[UNREADABLE] sayfa 2 eksik",
        tradeRegistry: "Eski serbest metin",
      },
    });
    render(<DogrulamaPage />);
    expect(screen.getByText(/Kayıt ülkeniz değişti/)).toBeInTheDocument();
    expect(
      screen.getByText("Belge okunmuyor ya da bulanık — net bir tarama yükleyin. Not: sayfa 2 eksik"),
    ).toBeInTheDocument();
    expect(screen.getByText("Eski serbest metin")).toBeInTheDocument();
    expect(screen.queryByText(/\[UNREADABLE\]/)).not.toBeInTheDocument();
  });

  it("yabancı firmada kimlik tek alan: iki yüz tek dosyada ipucu; KKTC Türkçe etiket, CN yerel ad", () => {
    h.data = docs({ country: "DE", required: ["tradeRegistry", "taxPlate", "idFront"] });
    const { unmount } = render(<DogrulamaPage />);
    expect(screen.getByText(/ön ve arka yüzünü tek dosyada/)).toBeInTheDocument();
    unmount();

    h.data = docs({ country: "XN", required: ["tradeRegistry", "taxPlate", "signatureCircular", "idFront"] });
    const xn = render(<DogrulamaPage />);
    expect(screen.getAllByText("Şirket tescil belgesi").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Certificate of Incorporation/)).not.toBeInTheDocument();
    xn.unmount();

    h.data = docs({ country: "CN", required: ["tradeRegistry", "idFront"] });
    render(<DogrulamaPage />);
    expect(screen.getAllByText(/营业执照/).length).toBeGreaterThanOrEqual(1);
  });
});
