// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reportMutate: vi.fn(),
  reportPending: false,
  reportData: undefined as unknown,
  downloadMutate: vi.fn(),
  downloadPending: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-reports", () => ({
  useSavingsReport: () => ({
    mutateAsync: h.reportMutate,
    isPending: h.reportPending,
    data: h.reportData,
  }),
  useDownloadSavingsReport: () => ({
    mutateAsync: h.downloadMutate,
    isPending: h.downloadPending,
  }),
}));

import { SavingsReportView } from "../savings-report-view";

function result(rows: unknown[]) {
  return {
    type: "ALIM",
    generatedAt: new Date().toISOString(),
    rangeStart: new Date().toISOString(),
    rangeEnd: new Date().toISOString(),
    currency: null,
    rows,
    summary: {
      totalListings: rows.length,
      grandHighest: 120000,
      grandLowest: 90000,
      grandTarget: 100000,
      grandActual: 90000,
      grandDelta: 30000,
      grandDeltaPct: 25,
      avgDeltaPct: 25,
      best: { number: "IHL-1", title: "Çelik Alımı", deltaPct: 25 },
      worst: null,
      byParty: [{ name: "Demir Ltd.", awarded: 90000 }],
    },
  };
}

function row() {
  return {
    id: "r1",
    number: "IHL-2026-0001",
    title: "Çelik Alımı",
    currency: "TRY",
    bidCount: 3,
    highestBid: 120000,
    lowestBid: 90000,
    winningTotal: 90000,
    delta: 30000,
    deltaPct: 25,
    targetTotal: 100000,
    actualTotal: 90000,
    winners: [{ name: "Demir Ltd.", total: 90000 }],
    items: [
      {
        name: "Profil",
        unit: "adet",
        quantity: 10,
        awardedQuantity: 10,
        referenceUnitPrice: 100,
        winningUnitPrice: 90,
        winnerName: "Demir Ltd.",
        itemReference: 1000,
        itemActual: 900,
        delta: 100,
      },
    ],
    awardedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  h.reportPending = false;
  h.reportData = undefined;
  h.downloadPending = false;
});

const base = { type: "ALIM" as const, basePath: "/company/satinalma/raporlar" };

describe("SavingsReportView", () => {
  it("kriter formu render edilir; tarih boşken butonlar pasif", () => {
    render(<SavingsReportView {...base} />);
    expect(screen.getByText("Tasarruf Raporu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raporu Oluştur/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Excel İndir/ })).toBeDisabled();
    // Arayüz testi son tur S-BUY: pasif düğmenin nedeni yazılı.
    expect(screen.getByText("Raporu oluşturmak için başlangıç ve bitiş tarihini seçin.")).toBeInTheDocument();
  });

  it("tarih aralığı girilince Raporu Oluştur mutasyonu tetiklenir", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockResolvedValue(result([row()]));
    const { container } = render(<SavingsReportView {...base} />);

    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-01-01");
    await user.type(dates[1] as HTMLElement, "2026-06-30");

    const submit = screen.getByRole("button", { name: /Raporu Oluştur/ });
    expect(submit).toBeEnabled();
    expect(screen.queryByText("Raporu oluşturmak için başlangıç ve bitiş tarihini seçin.")).toBeNull();
    await user.click(submit);

    expect(h.reportMutate).toHaveBeenCalledTimes(1);
    const payload = h.reportMutate.mock.calls[0][0];
    expect(payload.type).toBe("ALIM");
    // Günler İstanbul tam günü: 01.01 00:00 TR = 31.12 21:00Z; 30.06 sonu = 20:59:59.999Z.
    expect(payload.rangeStart).toBe("2025-12-31T21:00:00.000Z");
    expect(payload.rangeEnd).toBe("2026-06-30T20:59:59.999Z");
  });

  it("sonuç satırları + özet + karşı taraf kırılımı render edilir", () => {
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    expect(screen.getByText("Toplam Tasarruf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Çelik Alımı" })).toBeInTheDocument();
    // Tedarikçi bazlı kırılım başlığı.
    expect(screen.getByText("Tedarikçi Bazlı Kazanılan Tutar")).toBeInTheDocument();
    expect(screen.getAllByText("Demir Ltd.").length).toBeGreaterThanOrEqual(1);
  });

  it("kalem detayı açılıp kapanır", async () => {
    const user = userEvent.setup();
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    expect(screen.queryByText("Kalem Detayı")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kalem detayı: Çelik Alımı" }));
    expect(screen.getByText("Kalem Detayı")).toBeInTheDocument();
    // Telefonda kart listesi, sm+ iç tablo — ikisi de aynı kalemi taşır (CSS ile biri gizli).
    expect(within(screen.getByTestId("savings-items-table")).getByText(/Profil/)).toBeInTheDocument();
    expect(within(screen.getByTestId("savings-items-list")).getByText(/Profil/)).toBeInTheDocument();
  });

  it("kalem detayında miktar okuyucunun dilinde biçimlenir (derin denetim LU-28)", async () => {
    const user = userEvent.setup();
    const r = row();
    r.items[0] = { ...r.items[0], awardedQuantity: 1500.5 };
    h.reportData = result([r]);
    render(<SavingsReportView {...base} />);
    await user.click(screen.getByRole("button", { name: "Kalem detayı: Çelik Alımı" }));
    for (const id of ["savings-items-table", "savings-items-list"]) {
      const scope = within(screen.getByTestId(id));
      expect(scope.getByText("1.500,5")).toBeInTheDocument();
      expect(scope.getByText("(adet)")).toBeInTheDocument();
    }
  });

  it("satır açıcısı aria-expanded/controls taşır; kalem birim fiyatları para birimiyle (arayüz testi D-295)", async () => {
    const user = userEvent.setup();
    const r = row();
    h.reportData = { ...result([r]), baseCurrency: "USD" };
    render(<SavingsReportView {...base} />);
    const toggle = screen.getByRole("button", { name: "Kalem detayı: Çelik Alımı" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
    // Hedef 100, kazanan 90, kalem tasarrufu 100 — hepsi birimli, 2 ondalık
    // (sm+ iç tablo ve telefon kart listesi aynı biçimi kullanır).
    for (const id of ["savings-items-table", "savings-items-list"]) {
      const scope = within(screen.getByTestId(id));
      expect(scope.getAllByText("100,00 $").length).toBe(2); // hedef birim + kalem tasarrufu
      expect(scope.getByText("90,00 $")).toBeInTheDocument();
    }
  });

  // Mobil denetim g10-04 / g10-06 (2026-10-15).
  it("telefon yerleşimi: açıcı yapışkan ilk hücrede 44 px; kart tek kaydırıcı; kalem detayı telefonda kart listesi", async () => {
    const user = userEvent.setup();
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    const toggle = screen.getByRole("button", { name: "Kalem detayı: Çelik Alımı" });
    // Açıcı başlıkla aynı (ilk, yapışkan) hücrede — tablonun en sağında değil.
    const cell = toggle.closest("td")!;
    expect(cell.className.split(/\s+/)).toEqual(expect.arrayContaining(["sticky", "left-0", "bg-white"]));
    expect(within(cell).getByRole("link", { name: "Çelik Alımı" })).toBeInTheDocument();
    expect(cell.parentElement!.firstElementChild).toBe(cell);
    // 44 px kutu; sol pay hücre dolgusuna eşit (telefonda 8, sm+ 4 px) — kaydırıcı
    // kutuyu kırpmaz, sağ pay kutuyu başlığın önünde bitirir.
    expect(toggle.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["size-11", "-my-2.5", "-ml-2", "-mr-2", "sm:-ml-1"]),
    );
    // İlk sütun telefonda dar ve sarar (açıcıyla birlikte ~%52); sm+ eski tek satır.
    const firstCol = within(cell).getByRole("link", { name: "Çelik Alımı" }).parentElement!;
    expect(firstCol.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "min-w-[28vw]",
        "max-w-[36vw]",
        "whitespace-normal",
        "sm:min-w-0",
        "sm:max-w-none",
        "sm:whitespace-nowrap",
      ]),
    );
    // Talep numarası bölünmez; kazanan adları satır aralarından sarar.
    expect(within(firstCol).getByText("IHL-2026-0001 ·").className.split(/\s+/)).toContain("whitespace-nowrap");
    // Kart ikinci yatay kaydırıcı DEĞİL; kenar payı tablonun gutter'ına eşit.
    const card = cell.closest(".card")!;
    expect(card.className).not.toMatch(/overflow-x-auto/);
    expect(card.className.split(/\s+/)).toEqual(expect.arrayContaining(["overflow-hidden", "px-2", "[--gutter:--spacing(2)]"]));

    await user.click(toggle);
    const list = screen.getByTestId("savings-items-list");
    expect(list.className.split(/\s+/)).toContain("sm:hidden");
    expect(screen.getByTestId("savings-items-table").className.split(/\s+/)).toEqual(
      expect.arrayContaining(["hidden", "sm:block"]),
    );
    // Telefon kartı: kalem adı + miktar + tasarruf + kazanan tedarikçi tek blokta.
    const item = within(list).getByText(/Profil/).closest("li")!;
    expect(item.textContent).toMatch(/Demir Ltd\./);
    expect(item.textContent).toMatch(/100,00 ₺/);
    // Detay telefonda tablonun görünen genişliğine oturur ve yapışkandır.
    expect(list.parentElement!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["sticky", "w-[calc(100cqw-1rem)]", "sm:static"]),
    );
  });

  it("özet şeridi: 5 kutuda son kutu telefonda iki sütuna yayılır (boş gri kutu yok)", () => {
    h.reportData = result([row()]);
    render(<SavingsReportView {...base} />);
    const tiles = Array.from(screen.getByText("Toplam Tasarruf").closest("dl")!.children);
    expect(tiles).toHaveLength(5);
    expect(tiles[4]!.className).toContain("max-sm:col-span-2");
    expect(tiles.slice(0, 4).some((el) => el.className.includes("col-span-2"))).toBe(false);
  });

  it("kayan nokta gürültüsü (-1e-14) '%-0' değil '%0' basar (arayüz testi webB-01)", () => {
    const r = { ...row(), winningTotal: 120000, delta: 0, deltaPct: -2.18e-14 };
    const data = result([r]);
    data.summary = {
      ...data.summary,
      grandDelta: 0,
      grandDeltaPct: -1e-14,
      avgDeltaPct: -1.09e-14,
      best: { number: "IHL-1", title: "Çelik Alımı", deltaPct: -2.18e-14 },
      worst: { number: "IHL-1", title: "Çelik Alımı", deltaPct: -2.18e-14 } as never,
    };
    h.reportData = data;
    render(<SavingsReportView {...base} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/-0(?![\d.,])/);
    expect(text).toContain("%0");
  });

  it("eksi tasarruf yeşil boyanmaz", () => {
    const r = { ...row(), delta: -5000, deltaPct: -4.2 };
    h.reportData = result([r]);
    render(<SavingsReportView {...base} />);
    const cell = screen.getByText("-5.000 ₺");
    expect(cell.className).toContain("text-red-700");
  });

  it("ters tarih aralığında satır içi hata ve butonlar pasif (arayüz testi D-113)", async () => {
    const user = userEvent.setup();
    const { container } = render(<SavingsReportView {...base} />);
    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-09-30");
    await user.type(dates[1] as HTMLElement, "2026-09-01");
    expect(screen.getByText("Bitiş tarihi başlangıçtan önce olamaz.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Raporu Oluştur/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Excel İndir/ })).toBeDisabled();
  });

  it("Raporu Oluştur kriterleri adrese yazar; adresle açılış raporu yeniden üretir (arayüz testi D-293)", async () => {
    const user = userEvent.setup();
    h.reportMutate.mockResolvedValue(result([row()]));
    const first = render(<SavingsReportView {...base} />);
    const dates = first.container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-01-01");
    await user.type(dates[1] as HTMLElement, "2026-06-30");
    await user.click(screen.getByRole("button", { name: /Raporu Oluştur/ }));
    expect(window.location.search).toBe("?start=2026-01-01&end=2026-06-30");
    first.unmount();
    h.reportMutate.mockClear();

    // Talepten Geri: bileşen yeniden bağlanır, kriterler ve rapor geri gelir.
    const second = render(<SavingsReportView {...base} />);
    expect(h.reportMutate).toHaveBeenCalledTimes(1);
    expect(h.reportMutate.mock.calls[0][0].rangeStart).toBe("2025-12-31T21:00:00.000Z");
    const restored = second.container.querySelectorAll('input[type="date"]');
    expect((restored[0] as HTMLInputElement).value).toBe("2026-01-01");
    expect((restored[1] as HTMLInputElement).value).toBe("2026-06-30");
  });

  it("boş sonuç → 'kazandırılmış satın alma talebi yok' mesajı", () => {
    h.reportData = result([]);
    render(<SavingsReportView {...base} />);
    expect(
      screen.getByText(/Bu aralıkta kazandırılmış satın alma talebi yok/),
    ).toBeInTheDocument();
  });

  it("Excel indir başarılı → indirme mutasyonu + başarı toast'ı", async () => {
    const user = userEvent.setup();
    h.downloadMutate.mockResolvedValue({ filename: "tasarruf.xlsx" });
    const { container } = render(<SavingsReportView {...base} />);

    const dates = container.querySelectorAll('input[type="date"]');
    await user.type(dates[0] as HTMLElement, "2026-01-01");
    await user.type(dates[1] as HTMLElement, "2026-06-30");
    await user.click(screen.getByRole("button", { name: /Excel İndir/ }));

    expect(h.downloadMutate).toHaveBeenCalledTimes(1);
    expect(h.toast.success).toHaveBeenCalledWith("tasarruf.xlsx indiriliyor");
  });

});
