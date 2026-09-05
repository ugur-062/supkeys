// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCenterApiRow } from "@/hooks/use-company-dashboard";

const h = vi.hoisted(() => ({
  sa: { data: { rows: [] as ActionCenterApiRow[] }, isLoading: false, isError: false, refetch: vi.fn() },
  st: { data: { rows: [] as ActionCenterApiRow[] }, isLoading: false, isError: false, refetch: vi.fn() },
  unread: { satinalma: 0, satis: 0 },
  enabled: [] as string[],
}));
vi.mock("@/hooks/use-company-dashboard", () => ({
  useActionCenter: (portal: "satinalma" | "satis", enabled = true) => {
    h.enabled.push(`${portal}:${enabled}`);
    return portal === "satinalma" ? h.sa : h.st;
  },
}));
vi.mock("@/hooks/use-company-messages", () => ({
  useUnreadMessages: (portal: "satinalma" | "satis") => ({ data: { count: h.unread[portal] } }),
}));

import { CompanyActionCenter, buildCompanyActions, groupOf } from "../company-action-center";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const row = (over: Partial<ActionCenterApiRow>): ActionCenterApiRow => ({
  key: "x", severity: "info", count: 1, dueAt: null, overdueDays: null, waitingDays: null, ...over,
});

beforeEach(() => {
  h.sa.data = { rows: [] }; h.st.data = { rows: [] }; h.sa.isLoading = false; h.st.isLoading = false; h.sa.isError = false; h.st.isError = false;
  h.unread = { satinalma: 0, satis: 0 }; h.enabled = [];
});

describe("buildCompanyActions / groupOf", () => {
  it("aciliyete göre gruplar: gecikmiş › bugün › bu hafta › bekleyen; grup içinde kritik önce", () => {
    expect(groupOf(row({ overdueDays: 2 }))).toBe("overdue");
    expect(groupOf(row({ dueAt: day(0) }))).toBe("today");
    expect(groupOf(row({ dueAt: day(3) }))).toBe("week");
    expect(groupOf(row({ dueAt: day(20) }))).toBe("waiting");
    expect(groupOf(row({ waitingDays: 4 }))).toBe("waiting");
    const g = buildCompanyActions([
      { portal: "satinalma", rows: [row({ key: "awaitingDecision", severity: "warning", count: 3 }), row({ key: "overduePayments", severity: "critical", count: 1, overdueDays: 1 })], unread: 2 },
      { portal: "satis", rows: [row({ key: "unansweredInvites", severity: "warning", count: 4, dueAt: day(2) }), row({ key: "bilinmeyen", count: 9 })], unread: 0 },
    ]);
    expect(g.overdue.map((r) => r.key)).toEqual(["overduePayments"]);
    expect(g.week.map((r) => `${r.portal}:${r.key}`)).toEqual(["satis:unansweredInvites"]);
    // Bilinmeyen anahtar metin haritasında yok → düşer; mesaj satırı eklenir.
    expect(g.waiting.map((r) => `${r.portal}:${r.key}`)).toEqual(["satinalma:awaitingDecision", "satinalma:messages"]);
    expect(g.waiting[0]!.href).toBe("/company/satinalma/taleplerim");
  });
});

describe("CompanyActionCenter", () => {
  it("iki portal birleşik, grup başlıkları ve portal rozetleri; toplam sayı başlıkta", () => {
    h.sa.data = { rows: [row({ key: "overduePayments", severity: "critical", count: 1, overdueDays: 3 })] };
    h.st.data = { rows: [row({ key: "unansweredInvites", severity: "warning", count: 2, dueAt: day(1) })] };
    render(<CompanyActionCenter portals={["satinalma", "satis"]} />);
    const sec = screen.getByRole("region", { name: "Bekleyen işler" });
    // Başlık pili: toplam 2 (satırdaki "2 davete…" sayısı ile karışmasın).
    expect(within(sec.querySelector("h2")!.parentElement!).getByText("2")).toBeInTheDocument();
    expect(within(sec).getByText(/Gecikmiş/)).toBeInTheDocument();
    expect(within(sec).getByText(/Bu hafta/)).toBeInTheDocument();
    expect(within(sec).getByRole("link", { name: /siparişin ödemesi gecikti — 3 gün gecikti/ })).toHaveAttribute("href", "/company/satinalma/siparisler");
    expect(within(sec).getByRole("link", { name: /davete henüz teklif vermediniz — yarın/ })).toHaveAttribute("href", "/company/satis#acik-talepler");
    expect(within(sec).getByText("Satınalma")).toBeInTheDocument();
    expect(within(sec).getByText("Satış")).toBeInTheDocument();
  });

  it("yalnız satış erişimi: satınalma ucu çağrılmaz (enabled=false); boşsa tek satır", () => {
    render(<CompanyActionCenter portals={["satis"]} />);
    expect(h.enabled).toContain("satinalma:false");
    expect(h.enabled).toContain("satis:true");
    expect(screen.getByText("Bekleyen iş yok.")).toBeInTheDocument();
  });

  it("hata dalı boş liste sanılmaz", () => {
    h.st.isError = true;
    render(<CompanyActionCenter portals={["satis"]} />);
    expect(screen.getByText("Bekleyen işler yüklenemedi")).toBeInTheDocument();
  });
});
