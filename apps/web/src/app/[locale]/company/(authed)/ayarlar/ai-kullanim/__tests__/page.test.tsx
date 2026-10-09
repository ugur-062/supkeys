// @vitest-environment jsdom
/**
 * AI KULLANIMI — arayüz testi O-044 (erişim kilitliyse istek atılmaz) ve D-172
 * (havuz %100'ü aşınca "uyarı eşiği" değil "bütçe doldu — AI kapalı").
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  enabled: undefined as boolean | undefined,
  isError: false,
}));

vi.mock("@/hooks/use-ai-usage", () => ({
  useAiUsage: (enabled?: boolean) => {
    h.enabled = enabled;
    return {
      data: h.data,
      isLoading: false,
      isPending: h.data === undefined && !h.isError,
      isError: h.isError,
      error: h.isError ? { message: "Network Error" } : null,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/components/company-shell/premium-only", () => ({
  VerifiedOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../_components/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AiKullanimPage from "../page";

const company = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  view: "company",
  warnAtPercent: 80,
  percentUsed: 50,
  warning: false,
  exhausted: false,
  premiumPercentUsed: 0,
  byUser: [],
  byFeature: [],
  ...over,
});

beforeEach(() => {
  useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
  h.data = company();
  h.isError = false;
});

describe("AiKullanimPage — liste durumları (canlı doğrulama 2026-10-09 taraması)", () => {
  it("arka plan yenilemesi düşünce eldeki döküm kalır (hata satırına dönmez)", () => {
    h.data = company({ percentUsed: 85, warning: true });
    h.isError = true;
    render(<AiKullanimPage />);
    expect(screen.queryByText(/AI kullanımı yüklenemedi/)).toBeNull();
    expect(document.body.textContent).toMatch(/85/);
  });

  it("hiç okunamadıysa hata + Yeniden dene; yanıt yokken (duraklama) 'Yükleniyor…'", () => {
    h.data = undefined;
    h.isError = true;
    const { unmount } = render(<AiKullanimPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/AI kullanımı yüklenemedi/);
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
    unmount();

    h.isError = false;
    render(<AiKullanimPage />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AiKullanimPage", () => {
  it("efektif kademesi yetmeyen (doğrulanmamış) firmada kullanım isteği atılmaz; yetende atılır (O-044)", () => {
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "STANDART" } } as never);
    const { unmount } = render(<AiKullanimPage />);
    expect(h.enabled).toBe(false);
    unmount();
    useCompanyAuthStore.setState({ company: { country: "TR", tier: "SILVER" } } as never);
    render(<AiKullanimPage />);
    expect(h.enabled).toBe(true);
  });

  it("%85: uyarı rozeti, AI kapalı satırı yok", () => {
    h.data = company({ percentUsed: 85, warning: true });
    render(<AiKullanimPage />);
    expect(screen.getByText("Uyarı eşiği aşıldı")).toBeInTheDocument();
    expect(screen.queryByText("Bütçe doldu — AI kapalı")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("havuz doldu (%101,7): 'Bütçe doldu — AI kapalı' rozeti ve uyarı satırı (D-172)", () => {
    h.data = company({ percentUsed: 101.7, warning: true, exhausted: true });
    render(<AiKullanimPage />);
    expect(screen.getByText("Bütçe doldu — AI kapalı")).toBeInTheDocument();
    expect(screen.queryByText("Uyarı eşiği aşıldı")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/firma AI bütçesi doldu/);
  });

  it("kişisel tavan doldu (self görünümü): kişisel metin", () => {
    h.data = { enabled: true, view: "self", warnAtPercent: 80, percentUsed: 100, warning: true, exhausted: true };
    render(<AiKullanimPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/AI kullanım hakkınız doldu/);
  });

  it("firma görünümü, havuz %52 ama yöneticinin kişisel tavanı doldu: kişisel uyarı satırı, havuz rozeti yok (D-172)", () => {
    h.data = company({ percentUsed: 52, myExhausted: true });
    render(<AiKullanimPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/AI kullanım hakkınız doldu/);
    expect(screen.queryByText("Bütçe doldu — AI kapalı")).toBeNull();
  });
});
