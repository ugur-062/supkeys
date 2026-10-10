// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ButtonAccentProvider, accentForPortal } from "@/components/ui/button-accent";
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

/**
 * Son canlı kontrol NEW-PF-6: sağlayıcı firma kabuğunun DIŞINDA, portal rengi
 * kabuğun İÇİNDE sağlanır (`authed-layout-client.tsx` ↔ `shell.tsx`). Pencere
 * kendi konumundan okuyunca Satış portalında "Vitrinden çek" onayı varsayılan
 * maviyle çiziliyordu. Renk onayı İSTEYEN yerden gelir.
 */
describe("ConfirmDialog onay düğmesinin rengi", () => {
  /** Yerleşim gerçek düzenle AYNI: sağlayıcı dışta, portal rengi içte. */
  const renderInPortal = (portal: "satinalma" | "satis", destructive = false) =>
    render(
      <ConfirmProvider>
        <ButtonAccentProvider accent={accentForPortal(portal)}>
          <Harness destructive={destructive} />
        </ButtonAccentProvider>
      </ConfirmProvider>,
    );

  it("Satış portalından açılan onay portalın YEŞİLİNİ giyer (mavi değil)", async () => {
    const user = userEvent.setup();
    renderInPortal("satis");
    await user.click(screen.getByRole("button", { name: "Aç" }));
    const confirm = await screen.findByRole("button", { name: "Sil" });
    expect(confirm.className).toContain("--btn-bg:var(--color-emerald-600)");
    expect(confirm.className).not.toContain("--btn-bg:var(--color-blue-600)");
  });

  it("Satınalma portalından açılan onay MAVİ kalır", async () => {
    const user = userEvent.setup();
    renderInPortal("satinalma");
    await user.click(screen.getByRole("button", { name: "Aç" }));
    expect((await screen.findByRole("button", { name: "Sil" })).className).toContain("--btn-bg:var(--color-blue-600)");
  });

  it("yıkıcı onay portaldan bağımsız KIRMIZI", async () => {
    const user = userEvent.setup();
    renderInPortal("satis", true);
    await user.click(screen.getByRole("button", { name: "Aç" }));
    const confirm = await screen.findByRole("button", { name: "Sil" });
    expect(confirm.className).toContain("--btn-bg:var(--color-red-600)");
    expect(confirm.className).not.toContain("--btn-bg:var(--color-emerald-600)");
  });
});
