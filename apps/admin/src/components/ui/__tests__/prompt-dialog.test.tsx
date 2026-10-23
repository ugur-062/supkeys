// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptDialog } from "../prompt-dialog";

const onConfirm = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PromptDialog", () => {
  it("açıkken başlık + etiket gösterir", () => {
    render(
      <PromptDialog
        open
        title="Not ekle"
        label="Açıklama"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Not ekle")).toBeInTheDocument();
    expect(screen.getByLabelText("Açıklama")).toBeInTheDocument();
  });

  it("değer yazıp onayla → onConfirm trimlenmiş değerle çağrılır", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        title="Not ekle"
        label="Açıklama"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await user.type(screen.getByLabelText("Açıklama"), "merhaba");
    await user.click(screen.getByRole("button", { name: "Onayla" }));

    expect(onConfirm).toHaveBeenCalledWith("merhaba");
  });

  it("number: Türkçe '0,5' 5 DEĞİL — aralık hatası, Onayla kapalı; '12' kanonik gider (arayüz testi kapanış NUM)", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        title="Paket"
        label="Kaç ay verilsin?"
        type="number"
        min={1}
        max={60}
        required
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const input = screen.getByLabelText(/Kaç ay/);
    await user.type(input, "0,5");
    expect(screen.getByText("1-60 arası bir tam sayı girin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "12");
    await user.click(screen.getByRole("button", { name: "Onayla" }));
    expect(onConfirm).toHaveBeenCalledWith("12");
  });

  it("vazgeç → onClose çağrılır, onConfirm çağrılmaz", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        title="Not ekle"
        label="Açıklama"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("required + boş → onayla devre dışı, tıklama onConfirm çağırmaz", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        required
        title="Zorunlu"
        label="Sebep"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: "Onayla" });
    expect(confirmBtn).toBeDisabled();
    await user.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    // Değer girilince aktifleşir ve onConfirm çalışır. (required etiket görsel
    // "*" taşır → substring eşleşme.)
    await user.type(
      screen.getByLabelText("Sebep", { exact: false }),
      "gerekçe",
    );
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith("gerekçe");
  });

  it("yeniden açılışta defaultValue'ya sıfırlanır (önceki değer sızmaz)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PromptDialog
        open
        title="Düzenle"
        label="Ad"
        defaultValue="A"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const input = screen.getByLabelText("Ad") as HTMLInputElement;
    expect(input.value).toBe("A");
    await user.type(input, "BC");
    expect(input.value).toBe("ABC");

    // Kapat, sonra aynı defaultValue ile yeniden aç.
    rerender(
      <PromptDialog
        open={false}
        title="Düzenle"
        label="Ad"
        defaultValue="A"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    rerender(
      <PromptDialog
        open
        title="Düzenle"
        label="Ad"
        defaultValue="A"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const reopened = screen.getByLabelText("Ad") as HTMLInputElement;
    expect(reopened.value).toBe("A");
  });
});

describe("PromptDialog minLength (derin denetim MU-21)", () => {
  it("backend @MinLength altında Onayla kapalı; dialog açık kalır, metin kaybolmaz", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        title="İlanı Kapat"
        label="Gerekçe"
        required
        minLength={10}
        maxLength={500}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const input = screen.getByLabelText(/Gerekçe/);
    await user.type(input, "şikayet var");
    // 11 karakter → geçerli; 9 karaktere düşür.
    await user.clear(input);
    await user.type(input, "şikayet v");
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
    expect(screen.getByText(/En az 10 karakter \(9\/10\)/)).toBeInTheDocument();
    await user.type(input, "{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(input).toHaveValue("şikayet v");

    await user.type(input, "ar");
    await user.click(screen.getByRole("button", { name: "Onayla" }));
    expect(onConfirm).toHaveBeenCalledWith("şikayet var");
  });

  // Derin denetim LU-12: tarayıcı `min`'i yalnız seçicide uygular; elle
  // yazılan alt sınırdan önceki tarih gönderilmez.
  it("datetime-local: alt sınırdan önceki değer onaylanamaz", () => {
    render(
      <PromptDialog
        open
        title="Süre Uzat"
        label="Yeni kapanış"
        type="datetime-local"
        minDateTime="2026-10-01T18:00"
        defaultValue="2026-10-01T17:00"
        required
        confirmLabel="Uzat"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByLabelText(/Yeni kapanış/)).toHaveAttribute(
      "min",
      "2026-10-01T18:00",
    );
    expect(screen.getByRole("button", { name: "Uzat" })).toBeDisabled();
    expect(
      screen.getByText("Seçilen tarih izin verilen en erken tarihten önce"),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("datetime-local: alt sınır ve sonrası onaylanır", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        title="Süre Uzat"
        label="Yeni kapanış"
        type="datetime-local"
        minDateTime="2026-10-01T18:00"
        defaultValue="2026-10-02T09:30"
        required
        confirmLabel="Uzat"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Uzat" }));
    expect(onConfirm).toHaveBeenCalledWith("2026-10-02T09:30");
  });

  // Arayüz testi D-211: üst sınırdan (ör. şimdi + 2 yıl) sonraki tarih onaylanmaz.
  it("datetime-local: üst sınırdan sonraki değer onaylanamaz; sınırın kendisi onaylanır", () => {
    render(
      <PromptDialog
        open
        title="Süre Uzat"
        label="Yeni kapanış"
        type="datetime-local"
        minDateTime="2026-10-01T18:00"
        maxDateTime="2028-10-01T18:00"
        defaultValue="2029-12-31T10:00"
        required
        confirmLabel="Uzat"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const input = screen.getByLabelText(/Yeni kapanış/);
    expect(input).toHaveAttribute("max", "2028-10-01T18:00");
    expect(screen.getByRole("button", { name: "Uzat" })).toBeDisabled();
    expect(screen.getByText("Seçilen tarih izin verilen en geç tarihten sonra")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "2028-10-01T18:00" } });
    expect(screen.getByRole("button", { name: "Uzat" })).toBeEnabled();
  });

  it("onaya çift tık / kapanış animasyonundaki tık ikinci kez onConfirm çağırmaz (arayüz testi FX-00 O-045)", async () => {
    const confirm = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <PromptDialog
            open={open}
            title="Siparişi iptal et"
            label="Gerekçe"
            defaultValue="Taraflar anlaşamadı"
            onConfirm={(v) => {
              confirm(v);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
          <button type="button" onClick={() => setOpen(true)}>
            yeniden aç
          </button>
        </>
      );
    }
    render(<Harness />);
    const btn = screen.getByRole("button", { name: "Onayla" });
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
