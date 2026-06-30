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
});
