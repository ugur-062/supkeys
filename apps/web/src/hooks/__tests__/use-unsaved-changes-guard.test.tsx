// @vitest-environment jsdom
/**
 * KAYDEDİLMEMİŞ DEĞİŞİKLİK KORUMASI — `onDiscard` (canlı doğrulama 2026-10-09,
 * PD-R3). Diyalog "ayrılırsanız kaybolur" der; kullanıcı "Ayrıl" dediği an
 * form, kaydedilmemiş metnin başka yerde sakladığı kopyasını silebilmelidir.
 * Diyaloğun sorulmadığı ya da "Formda kal" denen durumda çağrılmaz.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ confirm: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => h.confirm }));

// İç bağlantı ham `<a href="/…">` ile YAZILMAZ (`@next/next/no-html-link-for-pages`
// test dosyasında da hatadır; `next lint` ve derlemenin lint aşaması düşer).
// `Link` üretimde korumanın karşılaştığı şeydir: `<a href>` çizer, kendi
// tıklama işleyicisi vardır ve yakalama aşamasındaki dinleyici ondan önce çalışır.
import { Link } from "@/i18n/navigation";
import { confirmAppLeave } from "@/lib/leave-guard";
import { useUnsavedChangesGuard } from "../use-unsaved-changes-guard";

function Form({ dirty, onDiscard, onResult }: { dirty: boolean; onDiscard?: () => void; onResult?: (leave: boolean) => void }) {
  const { confirmLeave } = useUnsavedChangesGuard(dirty, { onDiscard });
  return (
    <div>
      <Link href="/company/genel-bakis">Genel Bakış</Link>
      <button type="button" onClick={() => void confirmLeave().then((leave) => onResult?.(leave))}>
        Geri dön
      </button>
    </div>
  );
}

beforeEach(() => {
  h.confirm.mockReset();
  h.push.mockReset();
});

describe("useUnsavedChangesGuard — onDiscard", () => {
  it("bağlantı + 'Ayrıl': önce onDiscard, sonra gezinme", async () => {
    h.confirm.mockResolvedValue(true);
    const order: string[] = [];
    h.push.mockImplementation(() => order.push("push"));
    render(<Form dirty onDiscard={() => order.push("discard")} />);
    expect(fireEvent.click(screen.getByRole("link", { name: "Genel Bakış" }))).toBe(false);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/genel-bakis"));
    expect(order).toEqual(["discard", "push"]);
  });

  it("bağlantı + 'Formda kal': onDiscard çağrılmaz, gezinme yok", async () => {
    h.confirm.mockResolvedValue(false);
    const onDiscard = vi.fn();
    render(<Form dirty onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("link", { name: "Genel Bakış" }));
    await h.confirm.mock.results[0]!.value;
    await Promise.resolve();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("confirmLeave (bağlantı olmayan çıkış): 'Ayrıl' onDiscard'ı çağırır; temiz formda diyalog da onDiscard da yok", async () => {
    h.confirm.mockResolvedValue(true);
    const onDiscard = vi.fn();
    const onResult = vi.fn();
    const view = render(<Form dirty onDiscard={onDiscard} onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "Geri dön" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(onDiscard).toHaveBeenCalledTimes(1);

    h.confirm.mockClear();
    onDiscard.mockClear();
    onResult.mockClear();
    view.rerender(<Form dirty={false} onDiscard={onDiscard} onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "Geri dön" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(h.confirm).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("seçenek verilmeden de çalışır (öteki formlar değişmedi)", async () => {
    h.confirm.mockResolvedValue(true);
    function Plain() {
      useUnsavedChangesGuard(true);
      return <Link href="/company/genel-bakis">Genel Bakış</Link>;
    }
    render(<Plain />);
    fireEvent.click(screen.getByRole("link", { name: "Genel Bakış" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/genel-bakis"));
  });
});

// Mobil kabuk (mobil denetim g05): yeni sekme bağlantısı orada aynı WebView'de
// açılır (`NativeShellBridge`) ve gezinmeden önce `confirmAppLeave()` sorar.
describe("useUnsavedChangesGuard — kabuk gezinmesi (confirmAppLeave)", () => {
  it("kirli formda aynı diyalog sorulur; 'Ayrıl' onDiscard'ı çağırır ve izin verir", async () => {
    h.confirm.mockResolvedValue(true);
    const onDiscard = vi.fn();
    render(<Form dirty onDiscard={onDiscard} />);
    await expect(confirmAppLeave()).resolves.toBe(true);
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("'Formda kal' gezinmeyi durdurur; temiz formda ve söküldükten sonra sorulmaz", async () => {
    h.confirm.mockResolvedValue(false);
    const view = render(<Form dirty />);
    await expect(confirmAppLeave()).resolves.toBe(false);
    h.confirm.mockClear();
    view.rerender(<Form dirty={false} />);
    await expect(confirmAppLeave()).resolves.toBe(true);
    view.rerender(<Form dirty />);
    view.unmount();
    await expect(confirmAppLeave()).resolves.toBe(true);
    expect(h.confirm).not.toHaveBeenCalled();
  });
});
