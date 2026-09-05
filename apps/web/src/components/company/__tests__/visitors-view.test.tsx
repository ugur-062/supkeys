// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitorsResponse } from "@/hooks/use-company-views";

const h = vi.hoisted(() => ({ data: undefined as VisitorsResponse | undefined, isLoading: false, isError: false }));
vi.mock("@/hooks/use-company-views", () => ({
  useVisitors: () => ({ data: h.data, isLoading: h.isLoading, isError: h.isError }),
}));

import { VisitorsView } from "../visitors-view";

const base = (over: Partial<VisitorsResponse> = {}): VisitorsResponse => ({
  days: 30, total: 12, profileViews: 8, productViews: 4, identified: 2, anonymous: 5, locked: false, page: 1, pageSize: 20, totalItems: 2,
  items: [
    { company: { id: "c1", rothernId: "ABCD-1234", name: "Ziyaretçi A", slug: "za", city: "Bursa", activities: ["MANUFACTURER"], verified: true, logoUrl: null }, visits: 3, lastViewedAt: "2026-09-05T10:00:00Z", profileViews: 1, products: [{ id: "p1", name: "Kompanzasyon Panosu", slug: "kp" }], connected: true },
    { company: { id: "c2", rothernId: null, name: "Ziyaretçi B", slug: null, city: null, activities: [], verified: false, logoUrl: null }, visits: 1, lastViewedAt: "2026-09-04T10:00:00Z", profileViews: 1, products: [], connected: false },
  ],
  ...over,
});

beforeEach(() => { h.data = undefined; h.isLoading = false; h.isError = false; });

describe("VisitorsView", () => {
  it("özet sayılar + kimlikli liste: kim, ne baktı, kaç ziyaret, bağlantı, profil bağlantısı", () => {
    h.data = base();
    render(<VisitorsView />);
    expect(screen.getByRole("heading", { name: "Ziyaret Edenler" })).toBeInTheDocument();
    expect(screen.getByText("Toplam görüntülenme").nextSibling).toHaveTextContent("12");
    expect(screen.getByText("+ 5 anonim ziyaret")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ziyaretçi A" })).toHaveAttribute("href", "/company/firma/ABCD-1234");
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Baktığı: Profil, Kompanzasyon Panosu")).toBeInTheDocument();
    expect(screen.getByText("3 ziyaret")).toBeInTheDocument();
    expect(screen.getByText("Bağlantılı")).toBeInTheDocument();
    // Rothern ID'si olmayan firma bağlantısız satır.
    expect(screen.queryByRole("link", { name: "Ziyaretçi B" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Profili gör" })).toHaveLength(1);
  });

  it("Standart paket: sayılar var, liste kilitli + paket bağlantısı", () => {
    h.data = base({ locked: true, items: [] });
    render(<VisitorsView />);
    expect(screen.getByText("Kimliği bilinen firma").nextSibling).toHaveTextContent("2");
    expect(screen.getByText(/2 firma profilinizi inceledi/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Paketleri gör" })).toHaveAttribute("href", "/company/ayarlar");
    expect(screen.queryByText("Ziyaretçi A")).toBeNull();
  });

  it("boş dönem: tek eylem Profili tamamla", () => {
    h.data = base({ total: 0, profileViews: 0, productViews: 0, identified: 0, anonymous: 0, totalItems: 0, items: [] });
    render(<VisitorsView />);
    expect(screen.getByText("Bu dönemde kimliği bilinen ziyaretçi yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profili tamamla" })).toHaveAttribute("href", "/company/sirketim/profil");
  });
});
