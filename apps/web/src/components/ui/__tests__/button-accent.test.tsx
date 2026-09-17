// @vitest-environment jsdom
/**
 * BİRİNCİL DÜĞME RENGİ PORTALDAN (2026-09-17, kullanıcı kararı: "tuşlar siyah
 * olmasın — satınalmada mavi, satışta yeşil"). Kabuk `ButtonAccentProvider`
 * sağlar; Catalyst düğmesi `color` verilmemişse onu okur. Kabuk dışında
 * (herkese açık yüzey) siyah varsayılan korunur.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button as CatalystButton } from "@/components/catalyst/button";
import { Button } from "@/components/ui/button";
import { ButtonAccentProvider, accentForPortal } from "../button-accent";

describe("Button accent (portal rengi)", () => {
  it("bağlam yokken (kabuk dışı: giriş, pazar yeri) varsayılan MAVİ; siyah yalnız açık color ile", () => {
    render(<CatalystButton>Kaydet</CatalystButton>);
    expect(screen.getByRole("button", { name: "Kaydet" }).className).toContain("--btn-bg:var(--color-blue-600)");
    render(<CatalystButton color="dark/zinc">Siyah</CatalystButton>);
    expect(screen.getByRole("button", { name: "Siyah" }).className).toContain("--btn-bg:var(--color-zinc-900)");
  });

  it("satınalma kabuğunda birincil düğme MAVİ, satışta EMERALD", () => {
    render(
      <ButtonAccentProvider accent={accentForPortal("satinalma")}>
        <Button>Talep aç</Button>
      </ButtonAccentProvider>,
    );
    expect(screen.getByRole("button", { name: "Talep aç" }).className).toContain("--btn-bg:var(--color-blue-600)");

    render(
      <ButtonAccentProvider accent={accentForPortal("satis")}>
        <Button>Teklif ver</Button>
      </ButtonAccentProvider>,
    );
    expect(screen.getByRole("button", { name: "Teklif ver" }).className).toContain("--btn-bg:var(--color-emerald-600)");
  });

  it("açık renk (danger) ve outline/plain bağlamdan etkilenmez", () => {
    render(
      <ButtonAccentProvider accent="blue">
        <Button variant="danger">Sil</Button>
        <Button variant="secondary">Vazgeç</Button>
      </ButtonAccentProvider>,
    );
    expect(screen.getByRole("button", { name: "Sil" }).className).toContain("--btn-bg:var(--color-red-600)");
    expect(screen.getByRole("button", { name: "Vazgeç" }).className).not.toContain("--btn-bg:var(--color-blue-600)");
  });
});
