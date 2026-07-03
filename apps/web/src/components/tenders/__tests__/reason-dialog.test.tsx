// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReasonDialog } from "../reason-dialog";

function setup(props: Partial<React.ComponentProps<typeof ReasonDialog>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(
    <ReasonDialog
      open
      onClose={onClose}
      onSubmit={onSubmit}
      title="Teklifi ele"
      description="Bu teklif elensin mi?"
      confirmLabel="Ele"
      {...props}
    />,
  );
  return { onClose, onSubmit };
}

describe("ReasonDialog", () => {
  it("açıkken başlık + açıklama görünür", () => {
    setup();
    expect(screen.getByText("Teklifi ele")).toBeInTheDocument();
    expect(screen.getByText("Bu teklif elensin mi?")).toBeInTheDocument();
  });

  it("Vazgeç onClose çağırır", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("minLength altında onay devre dışı, üstünde aktif + trimli gönderir", async () => {
    const { onSubmit } = setup({ minLength: 10, confirmLabel: "Ele" });
    const confirm = screen.getByRole("button", { name: "Ele" });
    expect(confirm).toBeDisabled();

    const box = screen.getByRole("textbox");
    await userEvent.type(box, "  yetersiz  "); // trim → 9 karakter < 10
    expect(confirm).toBeDisabled();

    await userEvent.clear(box);
    await userEvent.type(box, "  yeterli gerekçe metni  ");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith("yeterli gerekçe metni");
  });

  it("minLength=0 (opsiyonel) → boşken bile onaylanır", async () => {
    const { onSubmit } = setup({ minLength: 0, confirmLabel: "Onayla" });
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));
    expect(onSubmit).toHaveBeenCalledWith("");
  });

  it("gönderim dialogu kapatmazsa (hata) yazılan metin KORUNUR", async () => {
    // Başarısız gönderimi taklit et: onSubmit çağrılır ama dialog açık kalır.
    const onSubmit = vi.fn();
    render(
      <ReasonDialog
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        title="İsteği reddet"
        confirmLabel="Reddet"
      />,
    );
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "gerekçe");
    await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
    expect(onSubmit).toHaveBeenCalledWith("gerekçe");
    // Dialog hâlâ açık → metin silinmemeli (yeniden yazmaya zorlamasın).
    expect(screen.getByRole("textbox")).toHaveValue("gerekçe");
  });

  it("dialog kapanınca metin sıfırlanır (yeniden açılışta boş)", async () => {
    const { rerender } = render(
      <ReasonDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="İsteği reddet"
        confirmLabel="Reddet"
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "eski metin");
    expect(screen.getByRole("textbox")).toHaveValue("eski metin");
    // Kapat → aç: state temizlenmeli.
    rerender(
      <ReasonDialog
        open={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="İsteği reddet"
        confirmLabel="Reddet"
      />,
    );
    rerender(
      <ReasonDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="İsteği reddet"
        confirmLabel="Reddet"
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
