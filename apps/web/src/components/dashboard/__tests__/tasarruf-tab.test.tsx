// @vitest-environment jsdom
/**
 * Tasarruf sekmesi — kategori satırının TUTARI yüzdeyle AYNI satırdan
 * (derin denetim MU-25, gözden geçirme). Eskiden tutar analytics'in
 * seçili-dönem `categorySavings` listesinden etiketle eşleniyordu: çeyrek
 * görünümde yıl yüzdesinin yanında çeyrek tutarı basılıyordu. Bu test o
 * eşleme geri gelirse kırmızı olur.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type { SatinalmaAnalytics } from "@/hooks/use-company-dashboard";
import { TasarrufTab, type TasarrufTabData } from "../tasarruf-tab";

const metrics = { totalSavings: 0, totalVolume: 0, averageSavingsRate: 0 };

const data: TasarrufTabData = {
  currency: "TRY",
  month: metrics,
  year: metrics,
  topSavingsMonth: [],
  topSavingsYear: [],
  categoryMonth: [{ label: "Ay Kategorisi", percent: 10, amount: 555 }],
  categoryYear: [{ label: "Elektrik Malzemeleri", percent: 25, amount: 1234 }],
  currencyMonth: [],
  currencyYear: [],
};

// Aynı etiketli ama FARKLI tutarlı (seçili dönem) analytics satırı.
const analytics = {
  currency: "TRY",
  savingsTrend: [],
  categorySavings: [{ label: "Elektrik Malzemeleri", amount: 98765, percent: 80 }],
} as unknown as SatinalmaAnalytics;

describe("TasarrufTab — kategori tutarı satırdan", () => {
  it("çeyrek görünümde tutar data.categoryYear satırından gelir, analytics eşlenmez", () => {
    render(<TasarrufTab data={data} period="quarter" analytics={analytics} />);
    const label = screen.getByText("Elektrik Malzemeleri");
    const row = label.closest("li") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.textContent).toMatch(/1\.234/);
    expect(row.textContent).not.toMatch(/98\.765/);
    // Ay satırı çeyrekte çizilmez (maliyet kırılımı yılı gösterir).
    expect(screen.queryByText("Ay Kategorisi")).toBeNull();
  });

  it("satırda tutar yoksa (eski yanıt) yalnız yüzde basılır — analytics tutarına düşülmez", () => {
    render(
      <TasarrufTab
        data={{ ...data, categoryYear: [{ label: "Elektrik Malzemeleri", percent: 25 }] }}
        period="year"
        analytics={analytics}
      />,
    );
    const row = screen.getByText("Elektrik Malzemeleri").closest("li") as HTMLElement;
    expect(row.textContent).not.toMatch(/98\.765/);
    expect(row.textContent).toMatch(/25/);
  });
});

describe("TasarrufTab — boş durum CTA'sı izne bağlı (arayüz testi T3)", () => {
  afterEach(() => useCompanyAuthStore.setState({ user: null } as never));

  it("talep açma izni yoksa 'Satın Alma Talebi Aç' çizilmez; izinliyse çizilir", () => {
    useCompanyAuthStore.setState({ user: { permissions: ["buy:view"], roles: [], isOwner: false } } as never);
    const { unmount } = render(<TasarrufTab data={data} period="year" analytics={analytics} />);
    expect(screen.getByText("Henüz tasarruf verisi yok")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Satın Alma Talebi Aç" })).toBeNull();
    unmount();
    useCompanyAuthStore.setState({
      user: { permissions: ["buy:view", "buy:listing:manage"], roles: [], isOwner: false },
    } as never);
    render(<TasarrufTab data={data} period="year" analytics={analytics} />);
    expect(screen.getByRole("link", { name: "Satın Alma Talebi Aç" })).toHaveAttribute(
      "href",
      "/company/satinalma/taleplerim/yeni",
    );
  });
});
