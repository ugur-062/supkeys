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
const BUYER = { roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage"] };
const SELLER = { roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] };
const h = vi.hoisted(() => ({
  tier: "GOLD" as string,
  user: { roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage"] } as {
    roles: string[];
    permissions: string[];
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    company: { tier: h.tier },
    user: h.user,
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
  it("GOLD firmanın satın almacısında ataç (belge ekle) görünür", () => {
    h.tier = "GOLD";
    h.user = BUYER;
    render(<AssistantPanel />);
    expect(screen.getByRole("button", { name: "Belge ekle" })).toBeInTheDocument();
  });

  it("SILVER firmada ataç çizilmez (talep AI'ı GOLD)", () => {
    h.tier = "SILVER";
    h.user = BUYER;
    render(<AssistantPanel />);
    expect(screen.queryByRole("button", { name: "Belge ekle" })).not.toBeInTheDocument();
    // Sohbet yine kullanılabilir.
    expect(screen.getByPlaceholderText(/Bir şey sorun/)).toBeInTheDocument();
  });
});

/**
 * Arayüz testi O-054/O-067: satın alma vaatleri (öneriler, ataç, yer tutucu)
 * yalnız alım koltuğu + satınalma paketi (GOLD) olan kullanıcıya; Gold
 * firmanın Satışçısı ataç görüp 403 almıyor, satış önerileri görüyor.
 */
describe("AssistantPanel — role ve pakete göre yetenekler", () => {
  it("GOLD firmanın Satışçısı: ataç ve satın alma önerileri yok, satış önerileri var", () => {
    h.tier = "GOLD";
    h.user = SELLER;
    render(<AssistantPanel />);
    expect(screen.queryByRole("button", { name: "Belge ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yeni satın alma talebi açmak istiyorum/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Satın Alma Taleplerimi göster/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Açık satın alma taleplerini ara/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tekliflerimi göster/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Bir şey sorun…")).toBeInTheDocument();
    expect(screen.queryByText(/konuşarak yeni satın alma talebi açın/)).toBeNull();
  });

  it("SILVER firmanın satın almacısı (satınalma paneli yok): satın alma talebi vaadi yok", () => {
    h.tier = "SILVER";
    h.user = BUYER;
    render(<AssistantPanel />);
    expect(screen.queryByRole("button", { name: /Yeni satın alma talebi açmak istiyorum/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Son siparişlerim/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Bir şey sorun…")).toBeInTheDocument();
  });

  it("GOLD firmanın satın almacısı: satın alma önerileri ve yer tutucu", () => {
    h.tier = "GOLD";
    h.user = BUYER;
    render(<AssistantPanel />);
    expect(screen.getByRole("button", { name: /Yeni satın alma talebi açmak istiyorum/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/satın alma talebi açın/)).toBeInTheDocument();
  });
});
