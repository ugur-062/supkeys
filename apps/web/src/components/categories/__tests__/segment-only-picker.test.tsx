// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "SEKTÖR GENELİ" PENCERESİ — kayıt denetimi 2026-10 (category-12, -14, -15,
 * code-category-5, -9, -10, -12, signup-tr-17).
 *
 * Elle yazılmış `div role=dialog` idi: odak kilidi yoktu, `z-50` ile asistan
 * çekmecesinin altında kalıyordu, satırlar segment harfiyle ("B.", "AN.")
 * başlıyordu, sözcükler ana pencereden farklıydı ("kategori", "max", "Tüm
 * Seçimi Temizle") ve düşen istek "Sonuç bulunamadı" görünüyordu.
 */
const h = vi.hoisted(() => ({
  roots: {} as { data?: unknown; isLoading?: boolean; isError?: boolean; refetch?: () => void },
  byIds: (ids: string[]) => ({ data: [] as unknown, ids }),
  rootsArgs: [] as unknown[][],
}));

vi.mock("@/hooks/use-categories", () => ({
  useRoots: (...args: unknown[]) => {
    h.rootsArgs.push(args);
    return h.roots;
  },
  useCategoriesByIds: (ids: string[]) => h.byIds(ids),
}));

import { SegmentOnlyModal } from "../segment-only-picker";

const SEGMENTS = [
  { id: "11000000", code: "11000000", nameTr: "Metaller ve Mineraller", level: 1, segmentLetter: "B" },
  { id: "12000000", code: "12000000", nameTr: "Kimyasal Maddeler", level: 1, segmentLetter: "C" },
  { id: "13000000", code: "13000000", nameTr: "Reçine ve Kauçuk", level: 1, segmentLetter: "D" },
  { id: "14000000", code: "14000000", nameTr: "Kağıt Ürünler", level: 1, segmentLetter: "E" },
  { id: "15000000", code: "15000000", nameTr: "Yakıtlar", level: 1, segmentLetter: "F" },
  { id: "71000000", code: "71000000", nameTr: "Madencilik Hizmetleri", level: 1, segmentLetter: "AN" },
];

function Modal(props: Partial<React.ComponentProps<typeof SegmentOnlyModal>>) {
  return (
    <SegmentOnlyModal
      isOpen
      onClose={() => {}}
      value={[]}
      onConfirm={() => {}}
      maxSelection={5}
      title="Sektör geneli"
      description="Bir sektörün tamamında çalışıyorsanız buradan seçin."
      {...props}
    />
  );
}

beforeEach(() => {
  h.roots = { data: SEGMENTS, isLoading: false, isError: false, refetch: vi.fn() };
  h.byIds = (ids: string[]) => ({ data: [], ids });
  h.rootsArgs = [];
});

describe("SegmentOnlyModal — ana pencereyle aynı kabuk", () => {
  it("Headless Dialog: portalda, asistan çekmecesinin (z-50) üstünde, `dvh` yüksekliğinde", () => {
    const { container } = render(<Modal />);
    const dialog = screen.getByRole("dialog", { name: "Sektör geneli" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Portal: çağıranın ağacında değil, gövdede.
    expect(container.contains(dialog)).toBe(false);
    expect((dialog.closest('[class*="z-"]') as HTMLElement).className).toContain("z-[60]");
    const panel = document.querySelector('[id^="headlessui-dialog-panel"]') as HTMLElement;
    expect(panel.className).toContain("100dvh");
    expect(panel.className).not.toMatch(/\d(vh|svh|lvh)\b/);
    // Alt köşeler: panel taşanı kırpar (alt satır köşeli kalıyordu).
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.className).toContain("rounded-2xl");
  });

  it("açılınca odak arama kutusunda; Tab pencereden çıkmaz (odak kilidi)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">arkadaki düğme</button>
        <Modal value={["11000000"]} />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Sektör ara" })).toHaveFocus());
    // Eskiden 33. Tab arkadaki sayfaya düşüyordu.
    for (let i = 0; i < 40; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("satırlarda segment harfi yok ('B.', 'AN.')", () => {
    render(<Modal />);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(SEGMENTS.map((s) => s.nameTr));
    expect(screen.getByRole("dialog").textContent).not.toMatch(/\b(B|C|AN)\.\s/);
  });

  it("sözcükler ana pencereyle aynı: 'sektör', 'max' yok, 'Tümünü temizle'", async () => {
    const user = userEvent.setup();
    render(<Modal value={SEGMENTS.slice(0, 5).map((s) => s.id)} />);
    expect(screen.getByText("Seçimleriniz")).toBeInTheDocument();
    // Görünen sayaç "5/5"; ekran okuyucuya tam cümle.
    expect(screen.getByText("5/5")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("5 sektör seçildi (en fazla 5)")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Tümünü temizle" })).toBeInTheDocument();
    expect(screen.queryByText(/Tüm Seçimi Temizle/)).toBeNull();

    // 6. seçim: uyarı "sektör" der, seçim eklenmez.
    await user.click(screen.getByRole("option", { name: "Madencilik Hizmetleri" }));
    expect(screen.getByRole("status")).toHaveTextContent("En fazla 5 sektör seçebilirsiniz");
    expect(screen.getByRole("option", { name: "Madencilik Hizmetleri" })).toHaveAttribute("aria-selected", "false");
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).not.toMatch(/\bmax\b/i);
    expect(text).not.toMatch(/kategori/i);
  });

  it("seç → onayla: seçim döner ve pencere kapanır", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<Modal onConfirm={onConfirm} onClose={onClose} />);
    const opt = screen.getByRole("option", { name: "Kimyasal Maddeler" });
    expect(opt).toHaveAttribute("aria-selected", "false");
    await user.click(opt);
    expect(opt).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith(["12000000"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("arama katlanmış eşleşir; temizle düğmesi listeyi geri getirir", async () => {
    const user = userEvent.setup();
    render(<Modal />);
    await user.type(screen.getByRole("textbox", { name: "Sektör ara" }), "kagit");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Kağıt Ürünler"]);
    await user.click(screen.getByRole("button", { name: "Aramayı temizle" }));
    expect(screen.getAllByRole("option")).toHaveLength(SEGMENTS.length);
  });
});

describe("SegmentOnlyModal — yükleme hatası ve kapatma", () => {
  it("istek düşerse 'Sonuç bulunamadı' değil hata + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.roots = { data: undefined, isLoading: false, isError: true, refetch };
    render(<Modal />);
    expect(screen.getByText(/Sektörler yüklenemedi/)).toBeInTheDocument();
    expect(screen.queryByText("Sonuç bulunamadı")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // webcat-6: hata listenin yerinde çizildiği için genel toast ve 429 tekrarı kapalı.
  it("sektör listesini 'inlineError' ile ister (çift hata gösterimi yok)", () => {
    render(<Modal />);
    expect(h.rootsArgs.at(-1)?.[0]).toEqual({ inlineError: true });
  });

  it("eşleşmeyen arama 'Sonuç bulunamadı' olarak kalır", async () => {
    const user = userEvent.setup();
    render(<Modal />);
    await user.type(screen.getByRole("textbox", { name: "Sektör ara" }), "zzz");
    expect(screen.getByText("Sonuç bulunamadı")).toBeInTheDocument();
  });

  it("onaylanmamış değişiklikte Escape sorar; 'Vazgeç' sormadan kapatır", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} />);
    await user.click(screen.getByRole("option", { name: "Yakıtlar" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog");
    await user.click(within(ask).getByRole("button", { name: "Seçime dön" }));
    expect(screen.getByRole("option", { name: "Yakıtlar" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("değişiklik yoksa Escape doğrudan kapatır", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} value={["11000000"]} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// code-category-12: gizlenmiş sektörün kodu sayaçta sayılıyor, listede yoktu.
describe("SegmentOnlyModal — kayıtlı ama listede olmayan (gizli) sektör", () => {
  it("adıyla (by-ids) listelenir ve kaldırılabilir", async () => {
    const user = userEvent.setup();
    const asked: string[][] = [];
    h.byIds = (ids: string[]) => {
      asked.push(ids);
      return { data: ids.includes("56000000") ? [{ id: "56000000", nameTr: "Mobilya ve Mefruşat" }] : [], ids };
    };
    const onConfirm = vi.fn();
    render(<Modal value={["56000000", "11000000"]} onConfirm={onConfirm} />);
    // Yalnız listede olmayan kod sorulur.
    expect(asked.at(-1)).toEqual(["56000000"]);
    const hidden = screen.getByRole("option", { name: "Mobilya ve Mefruşat" });
    expect(hidden).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("56000000")).toBeNull();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    await user.click(hidden);
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith(["11000000"]);
  });
});

// webcat-2: çok kısa ekranda (yükseklik ≤ 520 px) aradaki bölümün tamamı kayar;
// tavan uyarısı liste bloğunun tepesinde kalıp görüş alanından çıkıyordu
// (640×360'ta altıncı sektör: uyarı y = −344).
describe("SegmentOnlyModal — tavan uyarısı kısa ekranda da görünür", () => {
  it("uyarı, kayan bölümün doğrudan çocuğu olan ve o kipte tepeye yapışan blokta", async () => {
    const user = userEvent.setup();
    render(<Modal value={SEGMENTS.slice(0, 5).map((s) => s.id)} />);
    await user.click(screen.getByRole("option", { name: "Madencilik Hizmetleri" }));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("En fazla 5 sektör seçebilirsiniz");
    const slot = notice.closest('[class*="max-height:520px"][class*=":sticky"]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.className).toContain("[@media(max-height:520px)]:sticky");
    expect(slot.className).toContain("[@media(max-height:520px)]:top-0");
    const scroller = document.querySelector(
      'div[class*="[@media(max-height:520px)]:overflow-y-auto"]',
    ) as HTMLElement;
    expect(slot.parentElement).toBe(scroller);
    // Liste bloğunun içinde değil; listenin üstüne biner, yerleşimi itmez.
    expect((screen.getByRole("listbox").closest("div.overflow-y-auto") as HTMLElement).contains(notice)).toBe(false);
    expect(notice.className).toMatch(/\babsolute\b/);
  });
});

// webcat-9: "Tümünü temizle" yalnız seçim varken çizilir; basınca DOM'dan gider.
describe("SegmentOnlyModal — 'Tümünü temizle' sonrası odak", () => {
  it("klavyeyle: odak gövdeye düşmez, arama kutusuna geçer", async () => {
    const user = userEvent.setup();
    render(<Modal value={["11000000", "12000000"]} />);
    screen.getByRole("button", { name: "Tümünü temizle" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Tümünü temizle" })).toBeNull();
    expect(screen.getByText("0/5")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sektör ara" })).toHaveFocus();
  });

  it("fare/dokunmayla: odak arama kutusuna taşınmaz", async () => {
    const user = userEvent.setup();
    render(<Modal value={["11000000", "12000000"]} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Sektör ara" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Tümünü temizle" }));
    expect(screen.getByText("0/5")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sektör ara" })).not.toHaveFocus();
  });
});
