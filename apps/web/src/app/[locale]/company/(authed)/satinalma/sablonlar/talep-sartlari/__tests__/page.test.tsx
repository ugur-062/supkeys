// @vitest-environment jsdom
/**
 * Talep Şartları sayfası (arayüz testi webB-10):
 * - D-263: kaydetme yetkisi yoksa form salt okunur.
 * - D-268: diğer Şablonlar alt sayfaları gibi "← Şablonlar" geri bağlantısı.
 * - D-007: aralık dışı değerle Kaydet API'ye gitmez, Türkçe uyarı verir.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK } from "@rothern/shared";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  mutateAsync: vi.fn(),
  toastError: vi.fn(),
  /** Şart sorgusunun yerine geçer (yanıt yok / hata). */
  query: undefined as { data: undefined; isLoading: boolean; isError: boolean; refetch: () => void } | undefined,
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
  useCompanyAuth: () => ({ company: { country: "TR" } }),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: { company: { country: string } }) => unknown) => sel({ company: { country: "TR" } }),
}));
vi.mock("@/hooks/use-company-addresses", () => ({ useAddresses: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-request-defaults", () => ({
  useRequestDefaults: () =>
    h.query ?? {
      data: { defaults: { ...REQUEST_DEFAULTS_FALLBACK, paymentCategory: "DEFERRED", paymentDays: 30 }, source: "saved" },
      isLoading: false,
      isError: false,
    },
  useSaveRequestDefaults: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.toastError, info: vi.fn(), warning: vi.fn() } }));

import TalepSartlariPage from "../page";

beforeEach(() => {
  h.perms = [];
  h.mutateAsync.mockReset().mockResolvedValue({});
  h.toastError.mockReset();
  h.query = undefined;
});

describe("Talep Şartları sayfası — kesinti (canlı doğrulama 2026-10-09 taraması)", () => {
  it("şartlar okunamadıysa sonsuz 'Yükleniyor…' değil hata + Tekrar dene", () => {
    // Eskiden hata dalı yoktu: `isLoading || !draft` kesintide hep "Yükleniyor…".
    const refetch = vi.fn();
    h.query = { data: undefined, isLoading: false, isError: true, refetch };
    render(<TalepSartlariPage />);
    expect(screen.queryByText("Yükleniyor…")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("yanıt beklenirken 'Yükleniyor…'", () => {
    h.query = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    render(<TalepSartlariPage />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Talep Şartları sayfası", () => {
  it("geri bağlantısı Şablonlar'a gider", () => {
    render(<TalepSartlariPage />);
    expect(screen.getByRole("link", { name: /Şablonlar/ })).toHaveAttribute("href", expect.stringContaining("/company/satinalma/sablonlar"));
  });

  it("yetkisiz üye formu değiştiremez (salt okunur)", () => {
    render(<TalepSartlariPage />);
    expect(screen.getByLabelText(/Vade/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Şartları kaydet/i })).toBeNull();
  });

  it("aralık dışı vade günüyle kayıt gönderilmez", () => {
    h.perms = ["buy:listing:manage"];
    render(<TalepSartlariPage />);
    fireEvent.change(screen.getByLabelText(/Vade/), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith("Kaydetmeden önce işaretli alanları düzeltin");
  });

  it("NUM: geçersiz 'Özel gün' ('12,50') kaydı durdurur — önek (12) gönderilmez, aralık mesajı + odak", () => {
    h.perms = ["buy:listing:manage"];
    render(<TalepSartlariPage />);
    const box = screen.getByLabelText("Özel gün sayısı");
    fireEvent.focus(box);
    for (const typed of ["", "1", "12", "12,", "12,5", "12,50"]) fireEvent.change(box, { target: { value: typed } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith("1–60 gün arası tam sayı girin.");
    expect(document.activeElement).toBe(box);
    // Düzeltilince kayıt onaylanan değerle gider.
    fireEvent.change(box, { target: { value: "12" } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ closeDays: 12 }));
  });
});
