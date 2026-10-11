// @vitest-environment jsdom
/**
 * YETKİ TABLOSU — ERİŞİM KAPISI SÖZLEŞMESİ (ücretsiz dönem: kapı metni doğrulama der).
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
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
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

describe("PermissionTable — satınalma erişim kapısı", () => {
  it("satınalma verilemeyen firma: işlem tiki KİLİTLİ ve sebebi (firma doğrulaması) yazar", () => {
    ciz(false);
    expect(kilitli("Talep açma ve yönetme")).toBe(true);
    expect(screen.getByText(/işlem tikleri firma doğrulamasıyla açılır/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/gold|silver|paket/i);
  });

  it("ücretsiz/Silver: koltuksuz 'Satınalma görüntüleme' tiki SERBEST — API ve Görüntüleyici seti verir (arayüz testi T3)", () => {
    ciz(false);
    expect(kilitli("Satınalma görüntüleme")).toBe(false);
  });

  it("ücretsiz/Silver: SATIŞ tiki serbest — kapı yalnız satınalmaya", () => {
    ciz(false);
    expect(kilitli("Teklif verme")).toBe(false);
  });

  it("Gold: satınalma tiki açılır", () => {
    ciz(true);
    expect(kilitli("Talep açma ve yönetme")).toBe(false);
    expect(screen.queryByText(/işlem tikleri firma doğrulamasıyla açılır/)).not.toBeInTheDocument();
  });

  it("zaten verilmiş yetki kilitlenmez — mevcut yapılandırma sessizce bozulmaz", () => {
    // Kademe düşen firmada eski yetki duruyor olabilir; ekran onu kaldırılamaz
    // hâle getirmemeli (kaldırmak için ayrı bir akış var: seat-selection).
    ciz(false, ["buy:listing:manage", "buy:view"]);
    expect(kilitli("Talep açma ve yönetme")).toBe(false);
  });
});

describe("PermissionTable — hazır set çipi paket/koltuk kapısından geçer (derin denetim MU-13)", () => {
  function cizOnChange(props: { canGrantBuy: boolean; freeSeats?: number | null; value?: string[] }) {
    const onChange = vi.fn();
    render(
      <PermissionTable
        catalog={catalog}
        value={props.value ?? []}
        onChange={onChange}
        viewerIsOwner
        canGrantBuy={props.canGrantBuy}
        freeSeats={props.freeSeats ?? null}
      />,
    );
    return onChange;
  }

  it("Gold değilse Satın Almacı çipi seçilemez (paket vermiyor)", () => {
    const onChange = cizOnChange({ canGrantBuy: false });
    const chip = screen.getByRole("button", { name: "Satın Almacı" });
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("koltuk doluyken Satışçı çipi koltuk isteyen tiki işaretlemez", () => {
    const onChange = cizOnChange({ canGrantBuy: true, freeSeats: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Satışçı" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("koltuk varsa Satışçı çipi seti uygular (işlem tiki + görüntüleme)", () => {
    const onChange = cizOnChange({ canGrantBuy: false, freeSeats: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Satışçı" }));
    expect(onChange).toHaveBeenCalledWith(["sell:view", "sell:bid:submit"]);
  });

  it("işaretli ama firmanın erişiminde olmayan satınalma tiki sebebini yazar ve kaldırılabilir", () => {
    cizOnChange({ canGrantBuy: false, value: ["buy:view", "buy:listing:manage"] });
    expect(kilitli("Talep açma ve yönetme")).toBe(false);
    expect(screen.getByText("Firma doğrulaması gerekir")).toBeInTheDocument();
  });
});

describe("PermissionTable — satır yazısı kutuyu işaretler (arayüz testi D-134)", () => {
  it("izin adına tıklamak tiki açar; ad kesilmez (truncate yok)", () => {
    const onChange = vi.fn();
    render(
      <PermissionTable catalog={catalog} value={[]} onChange={onChange} viewerIsOwner canGrantBuy />,
    );
    const name = screen.getByText("Teklif verme");
    expect(name.className).not.toMatch(/truncate/);
    fireEvent.click(name);
    expect(onChange).toHaveBeenCalledWith(["sell:view", "sell:bid:submit"]);
  });

  it("kilitli satırın yazısına tıklamak bir şey değiştirmez", () => {
    const onChange = vi.fn();
    render(
      <PermissionTable catalog={catalog} value={[]} onChange={onChange} viewerIsOwner canGrantBuy={false} />,
    );
    fireEvent.click(screen.getByText("Talep açma ve yönetme"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("PermissionTable — yönetim tiki portal görüntülemesini getirir (arayüz testi T3)", () => {
  const mgmtCatalog: PermissionCatalog = {
    ...catalog,
    catalog: [
      ...catalog.catalog,
      { key: "connections:manage", label: "Bağlantılar", group: "management", seat: false },
      { key: "templates:manage", label: "Şablonlar", group: "management", seat: false },
    ],
  };

  function cizMgmt(value: string[]) {
    const onChange = vi.fn();
    render(
      <PermissionTable catalog={mgmtCatalog} value={value} onChange={onChange} viewerIsOwner canGrantBuy />,
    );
    return onChange;
  }

  it("Şablonlar tiki satınalma görüntülemesini ekler; o görüntüleme kilitli ve sebebini yazar", () => {
    const onChange = cizMgmt([]);
    fireEvent.click(screen.getByText("Şablonlar"));
    expect(onChange).toHaveBeenCalledWith(["buy:view", "templates:manage"]);
  });

  it("yalnız Bağlantılar tiki satış görüntülemesini ekler (sayfa satış portalında açılır)", () => {
    const onChange = cizMgmt([]);
    fireEvent.click(screen.getByText("Bağlantılar, engelleme ve şikayet"));
    expect(onChange).toHaveBeenCalledWith(["sell:view", "connections:manage"]);
  });

  it("getirilen görüntüleme kilitlidir; başka görüntüleme varken Bağlantılar'ınki serbest kalır", () => {
    const { unmount } = render(
      <PermissionTable
        catalog={mgmtCatalog}
        value={["buy:view", "templates:manage"]}
        onChange={vi.fn()}
        viewerIsOwner
        canGrantBuy
      />,
    );
    expect(kilitli("Satınalma görüntüleme")).toBe(true);
    expect(screen.getByText("Seçili yönetim tikiyle birlikte gelir")).toBeInTheDocument();
    unmount();
    render(
      <PermissionTable
        catalog={mgmtCatalog}
        value={["buy:view", "sell:view", "connections:manage"]}
        onChange={vi.fn()}
        viewerIsOwner
        canGrantBuy
      />,
    );
    expect(kilitli("Satış görüntüleme")).toBe(false);
    expect(kilitli("Satınalma görüntüleme")).toBe(false);
  });
});

// Arayüz testi son tur api-2: hazır setten sapan tikten sonra çip seçili
// kalmamalı (alt yazı "Kişiye özel" derken çip koyu görünüyordu). Seçim
// durumu ve alt yazı aynı kaynaktan; renk geçişi animasyonsuz (anlık).
describe("PermissionTable — hazır set çipi tikle senkron", () => {
  const cat: PermissionCatalog = {
    ...catalog,
    catalog: [
      ...catalog.catalog,
      { key: "sell:inquiry:reply", label: "Bilgi taleplerini yanıtla", group: "sell", seat: true },
    ],
    presets: {
      ...catalog.presets,
      SATISCI: ["sell:view", "sell:bid:submit", "sell:inquiry:reply"],
    },
  };
  function Kontrollu() {
    const [v, setV] = useState<string[]>(["sell:view", "sell:bid:submit", "sell:inquiry:reply"]);
    return <PermissionTable catalog={cat} value={v} onChange={setV} viewerIsOwner />;
  }

  it("Satışçı setinden bir tik kaldırılınca çip seçimi düşer, renk geçişi animasyonsuz", () => {
    render(<Kontrollu />);
    const chip = screen.getByRole("button", { name: /Satışçı/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Bilgi taleplerini yanıtlama"));
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.className).not.toContain("bg-zinc-900");
    expect(chip.className.split(/\s+/)).not.toContain("transition");
    expect(screen.getByText("Kişiye özel yetki kümesi.")).toBeInTheDocument();
  });
});
