// @vitest-environment jsdom
/**
 * BİLGİ BALONU — kapalıyken yerleşime girmez, açıkken görüntü alanında kalır
 * (2026-10-10).
 *
 * Şirketim › Genel Bakış › Tasarruf sekmesi 390 px'lik telefonda 504 px
 * genişliğindeydi: "En Yüksek Tasarruflu 5 Satın Alma Talebim" başlığının
 * yanındaki ikonun balonu görünmezken de (yalnız `opacity-0`) çiziliyor ve
 * ikona ortalı 320 px'lik kutusu sağ kenardan taşıyordu.
 *
 * jsdom YERLEŞİM HESAPLAMAZ. Burada kilitlenen:
 *  - sınıf sözleşmesi (kapalı balon `display: none`; genişlik tavanı görüntü
 *    alanına bağlı),
 *  - açma / kapama davranışı ve ekran okuyucu bağı,
 *  - kaydırma hesabı (`tooltipShift`, saf işlev) ve hesabın balona uygulanması
 *    (ölçüler sahte).
 * TARAYICI GEREKTİREN: sayfanın 320–390 px'te gerçekten yana kaymadığı
 * (`scrollWidth`), açık balonun kutusunun görüntü alanının içinde durduğu ve
 * metnin satırlara bölünüşü.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SatinalmaAnalytics } from "@/hooks/use-company-dashboard";
import { InfoTooltip, TOOLTIP_EDGE_GAP, tooltipShift } from "../info-tooltip";
import { TasarrufTab, type TasarrufTabData } from "../tasarruf-tab";
import { TedarikciTab } from "../tedarikci-tab";

const TEXT = "Seçilen dönemde, kalem-bazlı tasarruf hesabıyla bulduğumuz en yüksek tasarruflu 5 satın alma talebi.";
const tip = () => screen.getByRole("tooltip", { hidden: true });
const classes = () => tip().className.split(/\s+/);
const trigger = () => screen.getByRole("button", { name: "Bilgi" });

/** Görüntü alanı genişliği (jsdom'da 0) ve balonun kaydırılmamış kutusu. */
function layout(viewportWidth: number, box: { left: number; right: number }) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: viewportWidth });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isTip = this.getAttribute("role") === "tooltip";
    const left = isTip ? box.left : 0;
    const right = isTip ? box.right : 0;
    return { left, right, width: right - left, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document.documentElement, "clientWidth");
});

describe("tooltipShift — balonu görüntü alanında tutan yatay kaydırma", () => {
  it("sığan balon kaydırılmaz (ikona ortalı kalır)", () => {
    expect(tooltipShift({ left: 400, right: 720 }, 1366)).toBe(0);
    expect(tooltipShift({ left: TOOLTIP_EDGE_GAP, right: 390 - TOOLTIP_EDGE_GAP }, 390)).toBe(0);
  });

  // Bildirilen durum: 390 px, ikon merkezi ~343,5 px → balon 183,5–503,5 px (sayfa 504 px).
  it("sağdan taşan balon sola çekilir: 390 px'te 504'e uzanan kutu 382'de biter", () => {
    const shift = tooltipShift({ left: 183.5, right: 503.5 }, 390);
    expect(shift).toBe(-122);
    expect(503.5 + shift).toBeLessThanOrEqual(390 - TOOLTIP_EDGE_GAP);
    expect(183.5 + shift).toBeGreaterThanOrEqual(TOOLTIP_EDGE_GAP);
  });

  // Metrik başlıklarında ikon solda: balonun başı ekranın dışında kalıyordu.
  it("soldan taşan balon sağa çekilir", () => {
    const shift = tooltipShift({ left: -113, right: 207 }, 390);
    expect(shift).toBe(121);
    expect(-113 + shift).toBe(TOOLTIP_EDGE_GAP);
  });

  it("görüntü alanından geniş balonda sol kenar kazanır (metnin başı görünür kalır)", () => {
    const shift = tooltipShift({ left: 10, right: 400 }, 320);
    expect(10 + shift).toBe(TOOLTIP_EDGE_GAP);
  });

  it("görüntü alanı ölçülemiyorsa (genişlik 0) kaydırma yok", () => {
    expect(tooltipShift({ left: 0, right: 0 }, 0)).toBe(0);
    expect(tooltipShift({ left: -50, right: 270 }, Number.NaN)).toBe(0);
  });

  // 320–390 px: balon genişliği sınıftaki tavanla aynı — min(320, görüntü alanı − 32).
  it("320–390 px'in her genişliğinde, ikon nerede olursa olsun balon görüntü alanının içinde", () => {
    for (let viewport = 320; viewport <= 390; viewport++) {
      const width = Math.min(320, viewport - 32);
      for (let center = 0; center <= viewport; center += 0.5) {
        const box = { left: center - width / 2, right: center + width / 2 };
        const shift = tooltipShift(box, viewport);
        const where = `${viewport} px, ikon ${center} px`;
        expect(box.left + shift, where).toBeGreaterThanOrEqual(TOOLTIP_EDGE_GAP);
        expect(box.right + shift, where).toBeLessThanOrEqual(viewport - TOOLTIP_EDGE_GAP);
        // Gereğinden fazla kaydırılmaz: sığan balon yerinde kalır.
        if (box.left >= TOOLTIP_EDGE_GAP && box.right <= viewport - TOOLTIP_EDGE_GAP) expect(shift, where).toBe(0);
      }
    }
  });
});

describe("InfoTooltip — sınıf sözleşmesi ve davranış", () => {
  it("kapalı balon yerleşime GİRMEZ (`hidden`); yalnız saydamlıkla saklanmaz", () => {
    render(<InfoTooltip content={TEXT} />);
    expect(classes()).toContain("hidden");
    // Eski kusur: balon çiziliyor, `opacity-0` ile saklanıyordu → sayfayı genişletiyordu.
    expect(classes()).not.toContain("opacity-0");
    expect(classes().some((c) => c.includes("group-hover:"))).toBe(false);
    expect(tip()).toHaveTextContent(TEXT);
  });

  it("genişlik tavanı görüntü alanına bağlı: 320 px'lik ekranda 320 px'lik balon sığmaz", () => {
    render(<InfoTooltip content={TEXT} />);
    expect(classes()).toContain("max-w-[min(20rem,calc(100vw-2rem))]");
    expect(classes()).not.toContain("max-w-xs");
    // İkona ortalı çizim (yer varsa) ve içeriğe göre genişlik yerinde.
    expect(classes()).toEqual(expect.arrayContaining(["absolute", "bottom-full", "left-1/2", "-translate-x-1/2", "w-max"]));
  });

  it("ekran okuyucu: düğme balonla `aria-describedby` üzerinden bağlı (gizliyken de okunur)", () => {
    render(<InfoTooltip content={TEXT} />);
    const id = tip().getAttribute("id");
    expect(id).toBeTruthy();
    expect(trigger()).toHaveAttribute("aria-describedby", id);
    expect(trigger()).toHaveAccessibleDescription(TEXT);
  });

  it("fare üstündeyken açık, ayrılınca kapalı", () => {
    render(<InfoTooltip content={TEXT} />);
    fireEvent.mouseEnter(trigger().parentElement!);
    expect(classes()).not.toContain("hidden");
    fireEvent.mouseLeave(trigger().parentElement!);
    expect(classes()).toContain("hidden");
  });

  it("klavye odağında açık; odak gidince ya da Escape ile kapalı", () => {
    render(<InfoTooltip content={TEXT} />);
    act(() => trigger().focus());
    expect(classes()).not.toContain("hidden");
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(classes()).toContain("hidden");
    act(() => trigger().blur());
    act(() => trigger().focus());
    expect(classes()).not.toContain("hidden");
    act(() => trigger().blur());
    expect(classes()).toContain("hidden");
  });

  it("odaktayken fare ayrılsa da açık kalır (eski `group-focus-within` davranışı)", () => {
    render(<InfoTooltip content={TEXT} />);
    fireEvent.mouseEnter(trigger().parentElement!);
    act(() => trigger().focus());
    fireEvent.mouseLeave(trigger().parentElement!);
    expect(classes()).not.toContain("hidden");
  });

  it("dışarıya dokunma kapatır (dokunmatikte 'üstünde' hâli yapışır); ikonun kendisine dokunma kapatmaz", () => {
    render(
      <div>
        <InfoTooltip content={TEXT} />
        <p>başka yer</p>
      </div>,
    );
    fireEvent.mouseEnter(trigger().parentElement!);
    fireEvent.pointerDown(trigger());
    expect(classes()).not.toContain("hidden");
    fireEvent.pointerDown(screen.getByText("başka yer"));
    expect(classes()).toContain("hidden");
  });

  it("açılınca ölçülür: sağdan taşan balon sola kaydırılır (390 px, kutu 504'e uzanıyor)", () => {
    layout(390, { left: 183.5, right: 503.5 });
    render(<InfoTooltip content={TEXT} />);
    expect(tip().style.marginLeft).toBe("");
    fireEvent.mouseEnter(trigger().parentElement!);
    expect(tip().style.marginLeft).toBe("-122px");
  });

  it("açılınca ölçülür: soldan taşan balon sağa kaydırılır; sığan balona dokunulmaz", () => {
    layout(390, { left: -113, right: 207 });
    const first = render(<InfoTooltip content={TEXT} />);
    act(() => trigger().focus());
    expect(tip().style.marginLeft).toBe("121px");
    first.unmount();
    vi.restoreAllMocks();
    layout(1366, { left: 400, right: 720 });
    render(<InfoTooltip content={TEXT} />);
    fireEvent.mouseEnter(trigger().parentElement!);
    expect(classes()).not.toContain("hidden");
    expect(tip().style.marginLeft).toBe("");
  });

  it("yeniden açılışta eski kaydırma taşınmaz: ölçüm kaydırmasız kutudan yapılır", () => {
    layout(390, { left: 183.5, right: 503.5 });
    render(<InfoTooltip content={TEXT} />);
    const wrapper = trigger().parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(tip().style.marginLeft).toBe("-122px");
    fireEvent.mouseLeave(wrapper);
    // İkon artık ortada (sayfa döndü / pencere büyüdü): balon sığıyor.
    vi.restoreAllMocks();
    layout(1024, { left: 300, right: 620 });
    fireEvent.mouseEnter(wrapper);
    expect(tip().style.marginLeft).toBe("");
  });
});

/**
 * AYNI KALIP — Tasarruf sekmesinin altı balonu (ilk beş başlığı, üç metrik, iki
 * kırılım kartı) ve Tedarikçi sekmesinin balonu tek bileşendir. Hiçbiri kapalıyken
 * yerleşime girmez: sekme açıldığında sayfayı genişletecek görünmez kutu yoktur.
 */
describe("Şirketim sekmeleri — kapalı balonlar yerleşime girmez", () => {
  const metrics = { totalSavings: 0, totalVolume: 0, averageSavingsRate: 0 };
  const data: TasarrufTabData = {
    currency: "TRY",
    month: metrics,
    year: metrics,
    topSavingsMonth: [],
    topSavingsYear: [],
    categoryMonth: [],
    categoryYear: [{ label: "Elektrik Malzemeleri", percent: 25, amount: 1234 }],
    currencyMonth: [],
    currencyYear: [],
  };
  const analytics = { currency: "TRY", savingsTrend: [], categorySavings: [] } as unknown as SatinalmaAnalytics;

  it("Tasarruf sekmesi: altı balonun altısı da `hidden`, hiçbiri eski ortalı-saydam kalıpta değil", () => {
    const { container } = render(<TasarrufTab data={data} period="year" analytics={analytics} />);
    const tips = [...container.querySelectorAll('[role="tooltip"]')];
    expect(tips).toHaveLength(6);
    for (const el of tips) {
      const cls = el.className.split(/\s+/);
      expect(cls).toContain("hidden");
      expect(cls).not.toContain("opacity-0");
      expect(cls).toContain("max-w-[min(20rem,calc(100vw-2rem))]");
    }
    // Başlığın yanındaki balon (sayfayı 504 px'e genişleten).
    const heading = screen.getByRole("heading", { name: "En Yüksek Tasarruflu 5 Satın Alma Talebim" });
    const headingTip = heading.parentElement!.querySelector('[role="tooltip"]')!;
    expect(headingTip.className.split(/\s+/)).toContain("hidden");
    // Sekmede elle yazılmış başka bir "görünmez ama çizili" balon kalmadı.
    expect(container.querySelector(".opacity-0.absolute")).toBeNull();
  });

  it("Tedarikçi sekmesi: balon `hidden`", () => {
    const competitive = { tenderNumber: "ROT-000001", title: "Vana alımı", bidderCount: 0, distribution: [] };
    const { container } = render(
      <TedarikciTab
        data={{ topSuppliersMonth: [], topSuppliersYear: [], competitiveMonth: competitive, competitiveYear: competitive } as never}
        period="year"
      />,
    );
    const tips = [...container.querySelectorAll('[role="tooltip"]')];
    expect(tips.length).toBeGreaterThan(0);
    for (const el of tips) expect(el.className.split(/\s+/)).toContain("hidden");
  });
});
