// @vitest-environment jsdom
/**
 * AI KULLANIMI — arayüz testi O-044 (paket kilitliyse istek atılmaz) ve D-172
 * (havuz %100'ü aşınca "uyarı eşiği" değil "bütçe doldu — AI kapalı").
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  enabled: undefined as boolean | undefined,
}));

vi.mock("@/hooks/use-ai-usage", () => ({
  useAiUsage: (enabled?: boolean) => {
    h.enabled = enabled;
    return { data: h.data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  },
}));
vi.mock("@/components/company-shell/premium-only", () => ({
  PremiumOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
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
});

describe("AiKullanimPage", () => {
  it("STANDART firmada kullanım isteği atılmaz; Silver'da atılır (O-044)", () => {
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
