// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Derin denetim Y-05: asistanın belge eki belgeden SATIN ALMA TALEBİ taslağı
 * çıkarır (talep AI'ı = GOLD; sunucu TenderExtractService.extract'te GOLD
 * ister). Ortak yükleme presign'ı Silver'a açıldığı için (satış AI'ı
 * "Belgeden Fiyatla") ataç yalnız GOLD firmada çizilir — Silver'da yükleyip
 * gönderimde 403 almak yerine hiç sunulmaz.
 */
const h = vi.hoisted(() => ({ tier: "GOLD" as string }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    company: { tier: h.tier },
    user: { roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] },
  }),
}));
vi.mock("@/hooks/use-ai-usage", () => ({
  useAiUsage: () => ({ data: { enabled: true, percentUsed: 0, warning: false } }),
}));
vi.mock("@/hooks/use-ai-assistant", () => {
  const mutation = () => ({ isPending: false, mutateAsync: vi.fn() });
  return {
    useAssistantSessions: () => ({ data: [] }),
    useAssistantSession: () => ({ data: undefined }),
    useSendAssistantMessage: mutation,
    useDeleteAssistantSession: mutation,
    useAssistantAction: mutation,
  };
});

import { AssistantPanel } from "../assistant-panel";

// jsdom'da scrollIntoView yok (panel son mesaja kaydırır).
Element.prototype.scrollIntoView = vi.fn();

describe("AssistantPanel — belge eki paket kapısı", () => {
  it("GOLD firmada ataç (belge ekle) görünür", () => {
    h.tier = "GOLD";
    render(<AssistantPanel />);
    expect(screen.getByRole("button", { name: "Belge ekle" })).toBeInTheDocument();
  });

  it("SILVER firmada ataç çizilmez (talep AI'ı GOLD)", () => {
    h.tier = "SILVER";
    render(<AssistantPanel />);
    expect(screen.queryByRole("button", { name: "Belge ekle" })).not.toBeInTheDocument();
    // Sohbet yine kullanılabilir.
    expect(screen.getByPlaceholderText(/Bir şey sorun/)).toBeInTheDocument();
  });
});
