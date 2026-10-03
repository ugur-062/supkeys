// @vitest-environment jsdom
/**
 * "Özel gün" kutusu (arayüz testi kalanlar NUM:talep-formu:ozel-kapanis-gun,
 * NUM:NEW-7): "12,50" yazarken her geçerli önek ("1", "12") kapanışa
 * yazılıyor, kutu kırmızıyken taslak/şablon bu önekle kaydediliyordu.
 * Artık yalnız odaktan çıkınca ya da Enter'da geçerli tam gün onaylanır;
 * geçersizken kapanış son onaylı değerde kalır ve kayıt kapısı durdurur.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.toastError, info: vi.fn(), warning: vi.fn() } }));

import { CloseDaysInput, useCloseDaysGuard } from "../close-days-input";

const MSG = "1–60 gün arası tam sayı girin.";

function Harness({ initial = 7, onCommit }: { initial?: number; onCommit: (d: number) => void }) {
  const [days, setDays] = useState(initial);
  const [reset, setReset] = useState(0);
  const guard = useCloseDaysGuard();
  const [saved, setSaved] = useState<string>("");
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDays(14);
          setReset((n) => n + 1);
        }}
      >
        14 gün
      </button>
      {/* Zaten seçili süreyi yeniden seçen hazır seçenek: `value` değişmez. */}
      <button
        type="button"
        onClick={() => {
          setDays(7);
          setReset((n) => n + 1);
        }}
      >
        7 gün
      </button>
      <CloseDaysInput
        value={days}
        max={60}
        onChange={(d) => {
          onCommit(d);
          setDays(d);
        }}
        ariaLabel="Özel gün"
        suffix="gün"
        resetSignal={reset}
      />
      <output data-testid="days">{days}</output>
      <button type="button" onClick={() => setSaved(guard() ? `kaydedildi:${days}` : "durdu")}>
        Kaydet
      </button>
      <output data-testid="saved">{saved}</output>
    </div>
  );
}

/** Kullanıcının tuş tuş yazması: her ara metin ayrı `change`. */
function typeChars(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i += 1) fireEvent.change(input, { target: { value: text.slice(0, i) } });
}

beforeEach(() => h.toastError.mockReset());

describe("CloseDaysInput", () => {
  it.each(["12,50", "1.500", "0,5", "2.5"])("'%s' yazılırken kapanış önekleri izlemez; geçersiz metin kırmızı kalır", (typed) => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    typeChars(input, typed);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("days")).toHaveTextContent("7");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(MSG);
    // Odaktan çıkmak da geçersizi onaylamaz.
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("days")).toHaveTextContent("7");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("'12' yazıp odaktan çıkınca 12 onaylanır; yazarken kapanış değişmez", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.change(input, { target: { value: "" } });
    typeChars(input, "12");
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("days")).toHaveTextContent("7");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(12);
    expect(screen.getByTestId("days")).toHaveTextContent("12");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Enter geçerli değeri onaylar", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.change(input, { target: { value: "21" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(21);
  });

  it("aralık dışı tam sayı (61) onaylanmaz", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.change(input, { target: { value: "61" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("hazır seçenek geçersiz metni temizler", () => {
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText("Özel gün") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: "14 gün" }));
    expect(input.value).toBe("14");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("zaten seçili hazır seçenek (7) yeniden seçilince de geçersiz metin temizlenir ve kayıt sürer", () => {
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText("Özel gün") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12,50" } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "7 gün" }));
    expect(input.value).toBe("7");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByTestId("saved")).toHaveTextContent("kaydedildi:7");
    expect(h.toastError).not.toHaveBeenCalled();
  });
});

describe("useCloseDaysGuard", () => {
  it("geçersiz kutu kaydı durdurur: aynı aralık mesajı + odak", () => {
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.change(input, { target: { value: "12,50" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByTestId("saved")).toHaveTextContent("durdu");
    expect(h.toastError).toHaveBeenCalledWith(MSG);
    expect(document.activeElement).toBe(input);
  });

  it("geçerli kutuda kayıt son onaylı değerle sürer", () => {
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText("Özel gün");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByTestId("saved")).toHaveTextContent("kaydedildi:12");
    expect(h.toastError).not.toHaveBeenCalled();
  });
});
