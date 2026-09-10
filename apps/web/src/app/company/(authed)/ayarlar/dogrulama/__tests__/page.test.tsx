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

  it("yabancı firma: MERSİS alanı yok, belge etiketleri Türkçe + İngilizce", () => {
    h.data = docs({
      country: "KZ",
      required: ["tradeRegistry", "taxPlate", "idFront"],
    });
    render(<DogrulamaPage />);
    expect(screen.queryByLabelText("MERSİS No *")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Kuruluş \/ Sicil Belgesi/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Doğrulama Bilgileri \(opsiyonel\)/)).toBeInTheDocument();
  });
});
