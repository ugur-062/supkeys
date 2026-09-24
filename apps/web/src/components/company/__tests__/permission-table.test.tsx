// @vitest-environment jsdom
/**
 * YETKİ TABLOSU — PAKET KAPISI SÖZLEŞMESİ.
 *
 * Satınalma yetkisi yalnız GOLD'da verilebilir (2026-09-14, kullanıcı kararı):
 * talep açma ve kazandırma ücretsiz ve Silver pakette kapalı olduğu için yetki
 * de verilemez. Backend `assertSeatAvailable` bu kuralı zorluyor; bu ekran
 * onun AYNASI — kullanıcı kutuyu işaretleyip kaydettikten sonra 400 almasın,
 * kilidi ve SEBEBİNİ önceden görsün.
 *
 * Koltuk kilidinden AYRI tutulur: "koltuk dolu" sayı sorunudur, "Gold pakette"
 * paket sorunu. İkisi aynı kutuyu kilitler ama farklı şey söyler.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionTable } from "../permission-table";
import type { PermissionCatalog } from "@/hooks/use-company-users";

// İzin adları i18n Faz 2'den beri `perm.<kod>` anahtarından çizilir (API etiketi
// yalnız katalogda karşılığı olmayan izinde) → beklentiler katalog metnidir.
const catalog: PermissionCatalog = {
  catalog: [
    { key: "buy:view", label: "Satınalmayı görüntüle", group: "buy", seat: false },
    { key: "buy:listing:manage", label: "Talep yönet", group: "buy", seat: true },
    { key: "sell:view", label: "Satışı görüntüle", group: "sell", seat: false },
    { key: "sell:bid:submit", label: "Teklif ver", group: "sell", seat: true },
  ],
  groups: {
    buy: "Satınalma",
    sell: "Satış",
    approval: "Onay",
    management: "Yönetim",
  },
  presets: {
    SATIN_ALMACI: ["buy:listing:manage"],
    SATISCI: ["sell:bid:submit"],
    ONAYLAYICI: [],
    YONETICI: [],
    GORUNTULEYICI: [],
  },
  roleDefaults: {} as PermissionCatalog["roleDefaults"],
};

/**
 * Headless UI Checkbox bir <input> değil, `role="checkbox"` taşıyan <span>
 * basar — `toBeDisabled()` orada geçerli değil, kilit `aria-disabled` ile
 * bildirilir (ekran okuyucunun okuduğu da budur).
 */
const kilitli = (ad: string) =>
  screen.getByLabelText(ad).getAttribute("aria-disabled") === "true";

function ciz(canGrantBuy: boolean, value: string[] = []) {
  render(
    <PermissionTable
      catalog={catalog}
      value={value}
      onChange={vi.fn()}
      viewerIsOwner
      canGrantBuy={canGrantBuy}
    />,
  );
}

describe("PermissionTable — satınalma paket kapısı", () => {
  it("ücretsiz/Silver: satınalma işlem tiki KİLİTLİ ve sebebi yazar", () => {
    ciz(false);
    expect(kilitli("Talep açma ve yönetme")).toBe(true);
    expect(screen.getByText(/Gold pakette açılır/)).toBeInTheDocument();
  });

  it("ücretsiz/Silver: SATIŞ tiki serbest — kapı yalnız satınalmaya", () => {
    ciz(false);
    expect(kilitli("Teklif verme")).toBe(false);
  });

  it("Gold: satınalma tiki açılır", () => {
    ciz(true);
    expect(kilitli("Talep açma ve yönetme")).toBe(false);
    expect(screen.queryByText(/Gold pakette açılır/)).not.toBeInTheDocument();
  });

  it("zaten verilmiş yetki kilitlenmez — mevcut yapılandırma sessizce bozulmaz", () => {
    // Kademe düşen firmada eski yetki duruyor olabilir; ekran onu kaldırılamaz
    // hâle getirmemeli (kaldırmak için ayrı bir akış var: seat-selection).
    ciz(false, ["buy:listing:manage", "buy:view"]);
    expect(kilitli("Talep açma ve yönetme")).toBe(false);
  });
});
