// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim 2026-09-29:
 *  - yeni seçilen kategori, cevap gelene kadar (placeholder = önceki liste)
 *    "(silinmiş kategori)" görünüyordu; single modda eski seçimin adı kalıyordu
 *  - `validate` reddi modalı kapatmaz, taslak korunur
 */
const h = vi.hoisted(() => ({
  byIds: { data: undefined as unknown, isPlaceholderData: false },
}));

vi.mock("@/hooks/use-categories", () => ({
  useRoots: () => ({ data: [], isLoading: false }),
  useCategorySearchTree: () => ({ data: undefined, isLoading: false }),
  useChildren: () => ({ data: [], isLoading: false }),
  useCategoriesByIds: () => h.byIds,
}));

import { CategorySelectorModal } from "../category-selector-modal";

const A = { id: "39121600", nameTr: "Kablo", breadcrumb: "Elektrik › Kablo" };

beforeEach(() => {
  h.byIds = { data: undefined, isPlaceholderData: false };
});

describe("CategorySelectorModal — seçim bilgisi yüklenirken", () => {
  it("multi: placeholder listede olmayan yeni seçim '…' gösterir, 'silinmiş' değil", () => {
    h.byIds = { data: [A], isPlaceholderData: true };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("(silinmiş kategori)")).toBeNull();
  });

  it("multi: gerçek cevapta bulunmayan id 'silinmiş kategori' olarak kalır", () => {
    h.byIds = { data: [A], isPlaceholderData: false };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("(silinmiş kategori)")).toBeInTheDocument();
  });

  it("single: placeholder önceki seçimi taşırken eski adı 'Seçili' diye göstermez", () => {
    h.byIds = { data: [A], isPlaceholderData: true };
    render(
      <CategorySelectorModal isOpen mode="single" onClose={() => {}} value={["43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("✓ Seçili: …")).toBeInTheDocument();
    expect(screen.queryByText(/Kablo/)).toBeNull();
  });
});

describe("CategorySelectorModal — validate", () => {
  it("red: onConfirm/onClose çağrılmaz, metin modal içinde gösterilir", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <CategorySelectorModal
        isOpen
        onClose={onClose}
        value={[A.id]}
        onConfirm={onConfirm}
        validate={() => "Seçimleriniz 6 ayrı sektöre yayılıyor"}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/6 ayrı sektöre/);
  });

  it("geçerli: onaylanır ve kapanır", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <CategorySelectorModal isOpen onClose={onClose} value={[A.id]} onConfirm={onConfirm} validate={() => null} />,
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([A.id]);
    expect(onClose).toHaveBeenCalled();
  });
});

// Arayüz testi D-345: "Tümünü temizle" sonrası "Onayla" kapalı kalıyor,
// temizleme kaydedilemiyordu.
describe("CategorySelectorModal — boş seçimi onaylama", () => {
  it("başlangıçta seçim varsa temizleyip boş onaylanabilir", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Tümünü temizle" }));
    const confirm = screen.getByRole("button", { name: "Onayla" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("hiç seçim yokken onay kapalı kalır", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
  });
});
