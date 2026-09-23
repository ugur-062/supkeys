// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  replace: vi.fn(),
  user: { locale: "tr" } as { locale?: string },
}));

vi.mock("@/hooks/use-company-account", () => ({
  useUpdateMe: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: h.user }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/company/ayarlar/hesap-bilgileri",
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("sekme=dil"),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LanguageSection } from "../language-section";

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { locale: "tr" };
});

/**
 * AYARLAR › DİL SÖZLEŞMESİ: seçim ANINDA kaydedilir (`PATCH me { locale }`)
 * ve aynı sayfa + sorgu hedef dilin ön ekiyle yeniden açılır. Aynı dil
 * seçilirse istek atılmaz.
 */
describe("LanguageSection", () => {
  it("kayıtlı dili seçili gösterir; değişince kaydeder ve sayfayı yeni dille açar", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({});
    render(<LanguageSection />);
    const select = screen.getByLabelText("Dil") as HTMLSelectElement;
    expect(select.value).toBe("tr");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Türkçe", "English", "Русский"]);

    await user.selectOptions(select, "en");
    expect(h.mutateAsync).toHaveBeenCalledWith({ locale: "en" });
    expect(h.replace).toHaveBeenCalledWith("/company/ayarlar/hesap-bilgileri?sekme=dil", { locale: "en" });
  });

  it("aynı dil seçilirse istek atmaz", async () => {
    const user = userEvent.setup();
    render(<LanguageSection />);
    await user.selectOptions(screen.getByLabelText("Dil"), "tr");
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("kayıt başarısızsa yönlendirmez", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockRejectedValue(new Error("network"));
    render(<LanguageSection />);
    await user.selectOptions(screen.getByLabelText("Dil"), "ru");
    expect(h.replace).not.toHaveBeenCalled();
  });
});
