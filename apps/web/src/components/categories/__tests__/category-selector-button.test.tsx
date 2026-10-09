// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Form alanındaki kategori çipleri (talep / ürün formu) — kayıt denetimi 2026-10
 * çip kuralları burada da geçerli: adın tamamı, segment harfsiz yol, 32 px'lik
 * kaldırma hedefi, ad isteği düşünce "…" yerine kod + yeniden dene.
 */
const h = vi.hoisted(() => ({
  byIds: {} as { data?: unknown; isError?: boolean; refetch?: () => void },
  args: [] as unknown[][],
}));

vi.mock("@/hooks/use-categories", () => ({
  useCategoriesByIds: (...args: unknown[]) => {
    h.args.push(args);
    return h.byIds;
  },
}));
vi.mock("@/components/categories/category-selector-modal", () => ({
  CategorySelectorModal: () => <div data-testid="modal" />,
}));

import { CategorySelectorButton } from "../category-selector-button";

const LONG = "Elektrik kutuları, panoları, fitingleri ve aksesuarları";

beforeEach(() => {
  h.byIds = {
    data: [{ id: "39121300", nameTr: LONG, breadcrumb: `Z. Elektrik Sistemleri › Elektrik donanımı › ${LONG}` }],
  };
  h.args = [];
});

describe("CategorySelectorButton — seçim çipleri", () => {
  it("adın tamamı (kırpma yok), segment harfsiz yol, 32 px'lik adlı kaldırma düğmesi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategorySelectorButton value={["39121300"]} onChange={onChange} />);
    const name = screen.getByText(LONG);
    expect(name.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(name.className).toContain("break-words");
    const chip = name.parentElement as HTMLElement;
    expect(chip.className).toContain("max-w-full");
    expect(chip).toHaveAttribute("title", `Elektrik Sistemleri › Elektrik donanımı › ${LONG}`);
    const remove = screen.getByRole("button", { name: `${LONG} kategorisini kaldır` });
    expect(remove.className).toMatch(/\bsize-8\b/);
    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("ad isteği düşerse '…' değil kod + 'Yeniden dene' (genel toast kapalı)", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.byIds = { data: undefined, isError: true, refetch };
    render(<CategorySelectorButton value={["39121300"]} onChange={() => {}} />);
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.getByText("39121300")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "39121300 kategorisini kaldır" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(h.args.at(-1)?.[1]).toEqual({ inlineError: true });
  });

  it("ad yüklenirken '…'; hata satırı yok", () => {
    h.byIds = { data: undefined };
    render(<CategorySelectorButton value={["39121300"]} onChange={() => {}} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeniden dene" })).toBeNull();
  });
});

/**
 * GİZLİ SEGMENT + ÇÖZÜLEMEYEN KİMLİK (2026-10-09, arayüz denetimi W-09/W-11).
 * Eski kayıttaki gizli kategori (46 = kolluk/emniyet, 10 = canlı bitki) alanın
 * değerinde durabilir; alan onu ne adıyla ne koduyla ne de "…" çipiyle çizer.
 */
describe("CategorySelectorButton — gizli segment kodu ve satırı olmayan kimlik", () => {
  it("yalnız gizli kod taşıyan değer BOŞ durumla açılır; çip, kod ve '…' yok; nedeni söylenir", () => {
    // Güncel API gizli kodu hiç döndürmez (kanca da sormaz) → cevap yok.
    h.byIds = { data: undefined };
    render(<CategorySelectorButton value={["46181500"]} onChange={() => {}} mode="single" placeholder="Ürün kategorisini seçin" />);
    expect(screen.getByRole("button", { name: /Ürün kategorisini seçin/ })).toBeInTheDocument();
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.queryByText(/46181500/)).toBeNull();
    expect(screen.queryByRole("button", { name: /kategorisini kaldır/ })).toBeNull();
    // Alan neden boş: kategorinin adını anmadan.
    expect(screen.getByText("Önceki kategori artık kullanılmıyor. Lütfen güncel bir kategori seçin.")).toBeInTheDocument();
  });

  it("eski API gizli kodun adını döndürse de çip çizilmez", () => {
    h.byIds = {
      data: [
        { id: "39121300", nameTr: LONG, breadcrumb: "" },
        { id: "10151500", nameTr: "Tohumlar ve fideler", breadcrumb: "" },
      ],
    };
    render(<CategorySelectorButton value={["10151500", "39121300"]} onChange={() => {}} />);
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.queryByText(/Tohumlar|10151500/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /kategorisini kaldır/ })).toHaveLength(1);
  });

  it("görünür çip kaldırılınca dönen değerde gizli kod KALMAZ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    h.byIds = {
      data: [
        { id: "39121300", nameTr: LONG, breadcrumb: "" },
        { id: "39121600", nameTr: "Devre kesiciler", breadcrumb: "" },
      ],
    };
    render(<CategorySelectorButton value={["46181500", "39121300", "39121600"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Devre kesiciler kategorisini kaldır" }));
    expect(onChange).toHaveBeenCalledWith(["39121300"]);
  });

  it("ad cevabı geldiği hâlde satırı olmayan kimlik çizilmez — '…' asılı kalmaz", () => {
    h.byIds = { data: [{ id: "39121300", nameTr: LONG, breadcrumb: "" }] };
    render(<CategorySelectorButton value={["39121300", "39129999"]} onChange={() => {}} />);
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.queryByText("39129999")).toBeNull();
  });

  it("cevap önceki seçimin (placeholder) ise yeni eklenen kimlik '…' ile bekler — kaybolmaz", () => {
    h.byIds = { data: [{ id: "39121300", nameTr: LONG, breadcrumb: "" }], isPlaceholderData: true } as typeof h.byIds;
    render(<CategorySelectorButton value={["39121300", "39121600"]} onChange={() => {}} />);
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("görünür değerde 'önceki kategori' notu çizilmez", () => {
    render(<CategorySelectorButton value={["39121300"]} onChange={() => {}} />);
    expect(screen.queryByText(/Önceki kategori artık kullanılmıyor/)).toBeNull();
  });

  // Gözden geçirme R-WEB-01: talep formu gizli kodu değere HİÇ koymaz (tohumda
  // düşer) → alan boş açılır ve `value`dan nedenini bilemez; çağıran söyler.
  it("çağıran işaret verirse (retiredHint) değer boşken de not çizilir; işaret yoksa çizilmez", () => {
    h.byIds = { data: undefined };
    const view = render(<CategorySelectorButton value={[]} onChange={() => {}} retiredHint placeholder="Kategori seçin (en fazla 3)" />);
    expect(screen.getByRole("button", { name: /Kategori seçin \(en fazla 3\)/ })).toBeInTheDocument();
    expect(screen.getByText("Önceki kategori artık kullanılmıyor. Lütfen güncel bir kategori seçin.")).toBeInTheDocument();
    view.rerender(<CategorySelectorButton value={[]} onChange={() => {}} placeholder="Kategori seçin (en fazla 3)" />);
    expect(screen.queryByText(/Önceki kategori artık kullanılmıyor/)).toBeNull();
  });

  // Canlı doğrulama CP-04: kategorinin zorunlu olmadığı formda (yayındaki talep)
  // not "seçin" diye isterken formun kendi notu "gerekmez" diyordu.
  it("retiredOptional: not seçim İSTEMEZ — tek cümle, 'seçmeden de kaydedebilirsiniz'", () => {
    h.byIds = { data: undefined };
    const view = render(<CategorySelectorButton value={[]} onChange={() => {}} retiredHint retiredOptional />);
    expect(
      screen.getByText("Önceki kategori artık kullanılmıyor. Güncel bir kategori seçebilirsiniz; seçmeden de kaydedebilirsiniz."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Lütfen güncel bir kategori seçin/)).toBeNull();
    expect(screen.getAllByText(/Önceki kategori artık kullanılmıyor/)).toHaveLength(1);
    // İşaret yoksa (eski kategori yok) isteğe bağlı söz de çizilmez.
    view.rerender(<CategorySelectorButton value={[]} onChange={() => {}} retiredOptional />);
    expect(screen.queryByText(/Önceki kategori artık kullanılmıyor/)).toBeNull();
  });
});
