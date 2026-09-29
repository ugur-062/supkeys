// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FİRMA KATEGORİ SEÇİCİSİ — TÜRETME SÖZLEŞMESİ.
 *
 * Ekranın tek soruya inmesinin bedeli, segmentin artık kullanıcıdan değil
 * KODDAN gelmesi. Bu üç kural bozulursa firma eşleşme sinyalini sessizce
 * kaybeder (segment ekseni boş kalır) ya da tavanı aşıp 400 alır — ikisi de
 * kullanıcının göremediği türden arıza. Bu yüzden davranış kilitleniyor.
 */

const h = vi.hoisted(() => ({
  /** Modal "Onayla"ya basınca hangi yaprakların döneceği. */
  altSecim: [] as string[],
  segmentSecim: [] as string[],
  sonDeger: null as { mainIds: string[]; subIds: string[] } | null,
}));

vi.mock("@/hooks/use-categories", () => ({
  useRoots: () => ({
    data: [
      { id: "39000000", nameTr: "Elektrik Malzemeleri" },
      { id: "40000000", nameTr: "Dağıtım Sistemleri" },
      { id: "41000000", nameTr: "Laboratuvar" },
      { id: "42000000", nameTr: "Sağlık" },
      { id: "43000000", nameTr: "Bilişim" },
      { id: "44000000", nameTr: "Büro" },
    ],
  }),
  useCategoriesByIds: (ids: string[]) => ({
    data: ids.map((id) => ({ id, nameTr: `Yaprak ${id}` })),
  }),
}));

// İki modal da ağır (biri 1000+ satır, ikisi de katalog uçlarına gider).
// Burada sınanan şey seçim ARAYÜZÜ değil, onaydan SONRAKİ türetme.
// Sahte modal, gerçeğin onay sözleşmesini taklit eder: önce `validate`,
// reddederse onaylamaz ve metni modal İÇİNDE gösterir (modal açık kalır).
vi.mock("@/components/categories/category-selector-modal", async () => {
  const { useState } = await import("react");
  return {
    CategorySelectorModal: function SahteModal({
      onConfirm,
      validate,
    }: {
      onConfirm: (ids: string[]) => void;
      validate?: (ids: string[]) => string | null;
    }) {
      const [hata, setHata] = useState<string | null>(null);
      return (
        <div data-testid="alt-modal">
          <button
            type="button"
            onClick={() => {
              const e = validate?.(h.altSecim) ?? null;
              if (e) setHata(e);
              else onConfirm(h.altSecim);
            }}
          >
            alt-onayla
          </button>
          {hata ? <p data-testid="modal-hata">{hata}</p> : null}
        </div>
      );
    },
  };
});
vi.mock("@/components/categories/segment-only-picker", () => ({
  SegmentOnlyModal: ({
    onConfirm,
  }: {
    onConfirm: (ids: string[]) => void;
  }) => (
    <button type="button" onClick={() => onConfirm(h.segmentSecim)}>
      segment-onayla
    </button>
  ),
}));

import { CompanyCategoryPicker } from "../company-category-picker";

function Harness({
  mainIds = [],
  subIds = [],
}: {
  mainIds?: string[];
  subIds?: string[];
}) {
  return (
    <CompanyCategoryPicker
      value={{ mainIds, subIds }}
      onChange={(v) => {
        h.sonDeger = v;
      }}
      label="Ne satarım"
      hint="test"
      modalTitle="Satış kategorileriniz"
    />
  );
}

beforeEach(() => {
  h.altSecim = [];
  h.segmentSecim = [];
  h.sonDeger = null;
});

describe("CompanyCategoryPicker — segment türetme", () => {
  it("alt kategori seçilince SEGMENT koddan türetilir", async () => {
    const user = userEvent.setup();
    h.altSecim = ["39121600", "39131700"];
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));

    // Ata zinciri DAHİL saklanır: alıcı L3'te talep açtığında dar eksen tutsun.
    expect(h.sonDeger?.mainIds).toEqual(["39000000"]);
    // İki AYRI aile (3912…, 3913…) → her birinin L2'si de saklanır.
    expect(h.sonDeger?.subIds.sort()).toEqual([
      "39120000",
      "39121600",
      "39130000",
      "39131700",
    ]);
  });

  it("iki ayrı segmentten seçim iki segment üretir", async () => {
    const user = userEvent.setup();
    h.altSecim = ["39121600", "43211500"];
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));

    expect(h.sonDeger?.mainIds.sort()).toEqual(["39000000", "43000000"]);
  });

  it("tavan aşılırsa seçim UYGULANMAZ ve gerekçe yazılır", async () => {
    const user = userEvent.setup();
    // Altı ayrı segment — tavan 5.
    h.altSecim = [
      "39121600",
      "40121600",
      "41121600",
      "42121600",
      "43121600",
      "44121600",
    ];
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));

    // Sessizce kırpmak, kullanıcının beyanını haberi olmadan eksiltirdi.
    expect(h.sonDeger).toBeNull();
    // Red onaydan ÖNCE, modal içinde: modal açık kalır, taslak kaybolmaz
    // (derin denetim 2026-09-29 — eskiden modal kapanıyor, taslak gidiyordu).
    expect(screen.getByTestId("alt-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-hata")).toHaveTextContent(/6 ayrı sektöre/);
  });

  it("segment silinince ALTINDAKİ yapraklar da gider (zincirleme)", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        mainIds={["39000000", "43000000"]}
        subIds={["39121600", "43211500"]}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Elektrik Malzemeleri sektörünü ve altındaki seçimleri kaldır/,
      }),
    );

    expect(h.sonDeger).toEqual({
      mainIds: ["43000000"],
      subIds: ["43211500"],
    });
  });

  it("son seçim silinince SEGMENT DE düşer — sessiz genişleme olmasın", async () => {
    const user = userEvent.setup();
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(
      screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }),
    );

    // Segment kalsaydı firma tek yaprağı sildikten sonra TÜM elektrik
    // taleplerinin bildirimini almaya başlardı — düzeltmeye çalıştığımız arıza.
    expect(h.sonDeger).toEqual({ mainIds: [], subIds: [] });
  });

  it("kardeş seçim varken silme, segmenti ve ortak ataları KORUR", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        mainIds={["39000000"]}
        subIds={["39120000", "39121600", "39131700"]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }),
    );

    expect(h.sonDeger?.mainIds).toEqual(["39000000"]);
    expect(h.sonDeger?.subIds.sort()).toEqual(["39130000", "39131700"]);
  });

  it("sektör geneli modalından segment kaldırılırsa öksüz yaprak bırakılmaz", async () => {
    const user = userEvent.setup();
    h.segmentSecim = ["43000000"]; // 39 çıkarıldı
    render(
      <Harness
        mainIds={["39000000", "43000000"]}
        subIds={["39121600", "43211500"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("button", { name: "segment-onayla" }));

    expect(h.sonDeger).toEqual({
      mainIds: ["43000000"],
      subIds: ["43211500"],
    });
  });

  it("yaprağı olmayan segment 'sektörün tamamı' olarak işaretlenir", () => {
    render(<Harness mainIds={["39000000"]} />);
    expect(screen.getByText(/Sektörün tamamı/)).toBeInTheDocument();
  });
});
