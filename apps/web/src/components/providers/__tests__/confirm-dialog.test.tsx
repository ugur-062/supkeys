// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfirmProvider, useConfirm } from "../confirm-dialog";

/**
 * Dalga B-4 (denetim P10): yıkıcı onay diyaloğunda odak GÜVENLİ seçenekte
 * olmalı. Eskiden `autoFocus` koşulsuz onay butonundaydı → diyalog açılır
 * açılmaz Enter, geri alınamaz işlemi tek tuşta yapıyordu.
 */
function Harness({ destructive }: { destructive: boolean }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({
          title: "Emin misiniz?",
          destructive,
          confirmLabel: "Sil",
          cancelLabel: "Vazgeç",
        })
      }
    >
      Aç
    </button>
  );
}

describe("ConfirmDialog odak davranışı", () => {
  it("YIKICI diyalogda odak 'Vazgeç'te durur", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Harness destructive />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Aç" }));
    expect(await screen.findByRole("button", { name: "Vazgeç" })).toHaveFocus();
  });

  it("yıkıcı OLMAYAN diyalogda odak onay butonunda kalır (eski davranış)", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Harness destructive={false} />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Aç" }));
    expect(await screen.findByRole("button", { name: "Sil" })).toHaveFocus();
  });
});
