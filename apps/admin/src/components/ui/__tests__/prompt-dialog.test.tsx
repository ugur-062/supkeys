// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
