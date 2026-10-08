// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  /** Sahte ürün/hizmet penceresine geçen son özellikler. */
  modalProps: null as Record<string, unknown> | null,
  /** `by-ids` cevabı — null ise varsayılan ("Yaprak <kod>"). */
  byIds: null as null | ((ids: string[]) => unknown),
  byIdsArgs: [] as unknown[][],
  rootsArgs: [] as unknown[][],
}));

vi.mock("@/hooks/use-categories", () => ({
  useRoots: (...args: unknown[]) => {
    h.rootsArgs.push(args);
    return {
      data: [
        { id: "39000000", nameTr: "Elektrik Malzemeleri" },
        { id: "40000000", nameTr: "Dağıtım Sistemleri" },
        { id: "41000000", nameTr: "Laboratuvar" },
        { id: "42000000", nameTr: "Sağlık" },
        { id: "43000000", nameTr: "Bilişim" },
        { id: "44000000", nameTr: "Büro" },
      ],
    };
  },
  useCategoriesByIds: (...args: unknown[]) => {
    h.byIdsArgs.push(args);
    const ids = args[0] as string[];
    if (h.byIds) return h.byIds(ids);
    return {
      // Sektör kodları (L1) varsayılan cevapta YOK: adları sektör listesinden gelir.
      data: ids
        .filter((id) => !id.endsWith("000000"))
        .map((id) => ({ id, nameTr: `Yaprak ${id}` })),
    };
  },
}));

// İki modal da ağır (biri 1000+ satır, ikisi de katalog uçlarına gider).
// Burada sınanan şey seçim ARAYÜZÜ değil, onaydan SONRAKİ türetme.
// Sahte modal, gerçeğin onay sözleşmesini taklit eder: önce `validate`,
// reddederse onaylamaz ve metni modal İÇİNDE gösterir (modal açık kalır).
vi.mock("@/components/categories/category-selector-modal", async () => {
  const { useState } = await import("react");
  return {
    CategorySelectorModal: function SahteModal(props: {
      onConfirm: (ids: string[]) => void;
      validate?: (ids: string[]) => string | null;
    }) {
      const { onConfirm, validate } = props;
      h.modalProps = props as unknown as Record<string, unknown>;
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
  error,
}: {
  mainIds?: string[];
  subIds?: string[];
  error?: string;
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
      error={error}
    />
  );
}

beforeEach(() => {
  h.altSecim = [];
  h.segmentSecim = [];
  h.sonDeger = null;
  h.modalProps = null;
  h.byIds = null;
  h.byIdsArgs = [];
  h.rootsArgs = [];
});

/** Seçimi gerçekten uygulayan sarmalayıcı — kaldırınca çipin DOM'dan gittiği testler için. */
function Stateful({ mainIds, subIds }: { mainIds: string[]; subIds: string[] }) {
  const [v, setV] = useState({ mainIds, subIds });
  return (
    <CompanyCategoryPicker
      value={v}
      onChange={setV}
      label="Ne satarım"
      hint="test"
      modalTitle="Satış kategorileriniz"
    />
  );
}

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

// Kayıt denetimi 2026-10 (category-6/-13/-14, code-category-3/-7): firma beyanı
// aile (L2) seçebilir, dal başına tek seçim tutar ve tavanı kendi sözcüğüyle söyler.
describe("CompanyCategoryPicker — ürün/hizmet penceresine geçenler", () => {
  it("L2 seçimi, dal başına tek seçim ve 'ürün/hizmet' sözcüklü tavan uyarısı", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await screen.findByTestId("alt-modal");
    expect(h.modalProps).toMatchObject({
      catalog: "full",
      mode: "multi",
      maxSelection: 50,
      minSelectableLevel: 2,
      singlePickPerBranch: true,
      limitMessage: "En fazla 50 ürün/hizmet seçebilirsiniz.",
    });
  });

  it("aile (L2) seçimi: segment ana eksene, aile alt eksene yazılır ve çip olarak görünür", async () => {
    const user = userEvent.setup();
    h.altSecim = ["39120000"];
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toEqual({ mainIds: ["39000000"], subIds: ["39120000"] });
  });
});

// category-7/-8/-10, code-category-4, signup-enru-3, signup-tr-22.
describe("CompanyCategoryPicker — çipler ve dokunma hedefleri", () => {
  it("çip adın tamamını gösterir (sabit piksel tavanı yok) ve kutusunun dışına çıkmaz", () => {
    const uzun = "Preslenmiş, sinterlenmiş ve işlenmiş izotropik ferrit mıknatıs";
    h.byIds = (ids) => ({
      data: ids
        .filter((id) => id === "31381520")
        .map((id) => ({ id, nameTr: uzun, breadcrumb: `P. Üretim › Mıknatıslar › ${uzun}` })),
    });
    render(<Harness mainIds={["39000000"]} subIds={["31380000", "31381500", "31381520"]} />);
    const ad = screen.getByText(uzun);
    expect(ad.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(ad.className).toContain("break-words");
    const cip = ad.parentElement as HTMLElement;
    expect(cip.className).toContain("max-w-full");
    expect(cip.className).toContain("min-w-0");
    // Yol ipucunda segment harfi ("P. ") yok.
    expect(cip).toHaveAttribute("title", `Üretim › Mıknatıslar › ${uzun}`);
  });

  it("kaldırma düğmeleri ve metin eylemleri en az 32 px; sektör ikonu ezilmez", () => {
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    for (const name of [
      /Yaprak 39121600 seçimini kaldır/,
      /Elektrik Malzemeleri sektörünü ve altındaki seçimleri kaldır/,
    ]) {
      const b = screen.getByRole("button", { name });
      expect(b.className).toMatch(/\bsize-8\b/);
      expect(b.className).toContain("shrink-0");
    }
    for (const name of [/Ürün \/ hizmet ekle/, /Sektör geneli ekle/]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/\bmin-h-8\b/);
    }
    const ikon = screen.getByText("Elektrik Malzemeleri").parentElement!.querySelector("svg")!;
    expect(ikon.getAttribute("class")).toContain("shrink-0");
  });

  it("son seçim kaldırılınca odak gövdeye düşmez: boş durum düğmesine geçer", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toHaveFocus();
  });

  it("başka seçim kalmışsa odak 'Ürün / hizmet ekle'ye geçer", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000"]} subIds={["39120000", "39121600", "39131700", "39130000"]} />);
    screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Yaprak 39121600")).toBeNull();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })).toHaveFocus();
  });
});

// webcat-1: `focus()` hedefi görünüme kaydırır. Odak her kaldırmada (fare ve
// dokunma dahil) ekleme düğmesine taşınınca sayfa listenin sonuna atlıyordu
// (360×640, 24 seçim: scrollY 0 → 660). Penceredeki çip kuralı: yalnız klavye.
describe("CompanyCategoryPicker — fare/dokunmayla kaldırma odağı (ve sayfayı) taşımaz", () => {
  it("çip fareyle kaldırılınca odak 'Ürün / hizmet ekle'ye taşınmaz", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000"]} subIds={["39120000", "39121600", "39131700", "39130000"]} />);
    await user.click(screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }));
    expect(screen.queryByText("Yaprak 39121600")).toBeNull();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })).not.toHaveFocus();
  });

  it("son seçim fareyle kaldırılınca boş durum düğmesi odaklanmaz", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }));
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).not.toHaveFocus();
  });

  it("sektör: fareyle kaldırınca odak taşınmaz; klavyeyle kaldırınca ekleme düğmesine geçer", async () => {
    const user = userEvent.setup();
    render(
      <Stateful
        mainIds={["39000000", "43000000", "44000000"]}
        subIds={["39120000", "39121600", "43210000", "43211500"]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Elektrik Malzemeleri sektörünü ve altındaki seçimleri kaldır/ }),
    );
    expect(screen.queryByText("Elektrik Malzemeleri")).toBeNull();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })).not.toHaveFocus();

    screen.getByRole("button", { name: /Bilişim sektörünü ve altındaki seçimleri kaldır/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Bilişim")).toBeNull();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })).toHaveFocus();
  });
});

// webcat-7 (açık bulgu code-category-6): türetme "Sektör geneli" segmentlerini
// başa alıyordu. Pencereyi hiçbir şeye dokunmadan onaylamak `mainIds`i yeni
// sırayla döndürüyor; Ayarlar dizileri sıralı karşılaştırdığı için form
// kirleniyor, "Kaydet" açılıyor ve sayfadan çıkış uyarısı çıkıyordu.
describe("CompanyCategoryPicker — değişmeyen beyan onChange üretmez; kayıtlı sıra korunur", () => {
  // 40 "Sektör geneli" ile eklenmiş (altında seçim yok); 39'un altında tek seçim.
  const KAYITLI = {
    mainIds: ["39000000", "40000000"],
    subIds: ["39120000", "39121000", "39121001"],
  };

  it("pencere hiçbir şeye dokunmadan onaylanırsa onChange çağrılmaz", async () => {
    const user = userEvent.setup();
    h.altSecim = ["39121001"];
    render(<Harness {...KAYITLI} />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toBeNull();
  });

  it("aynı seçimler farklı sırayla dönerse de onChange çağrılmaz (sıra farkı değişiklik değildir)", async () => {
    const user = userEvent.setup();
    h.altSecim = ["39131700", "39121600"];
    render(
      <Harness
        mainIds={["39000000", "40000000"]}
        subIds={["39120000", "39121600", "39130000", "39131700"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toBeNull();
  });

  it("yeni seçim eklenince kayıtlı sıra korunur: sektör kartları yer değiştirmez, yeniler sona eklenir", async () => {
    const user = userEvent.setup();
    h.altSecim = ["43211500", "39121001"];
    render(<Harness {...KAYITLI} />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "40000000", "43000000"],
      subIds: ["39120000", "39121000", "39121001", "43210000", "43211500"],
    });
  });

  it("çip kaldırınca 'Sektör geneli' kartı başa geçmez", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        mainIds={["39000000", "40000000"]}
        subIds={["39120000", "39121600", "39130000", "39131700"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Yaprak 39121600 seçimini kaldır/ }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "40000000"],
      subIds: ["39130000", "39131700"],
    });
  });

  it("sektör geneli penceresi aynı kümeyi farklı sırayla döndürürse onChange çağrılmaz", async () => {
    const user = userEvent.setup();
    h.segmentSecim = ["43000000", "39000000"];
    render(<Harness mainIds={["39000000", "43000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("button", { name: "segment-onayla" }));
    expect(h.sonDeger).toBeNull();
  });

  it("sektör geneli penceresinden eklenen sektör sona gelir; kayıtlı sıra korunur", async () => {
    const user = userEvent.setup();
    h.segmentSecim = ["44000000", "43000000", "39000000"];
    render(<Harness mainIds={["39000000", "43000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("button", { name: "segment-onayla" }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "43000000", "44000000"],
      subIds: ["39120000", "39121600"],
    });
  });
});

// web-auth-2: onboarding "Devam"da odak seçiciye taşınır; hata görünür ama
// rolsüz ve düğmeye bağlı olmadığı için ekran okuyucu yalnız düğmeyi okuyordu.
describe("CompanyCategoryPicker — zorunlu alan hatası ekran okuyucuya söylenir", () => {
  const HATA = "En az bir ürün ya da hizmet seçin";

  it("boş durum: hata `alert` bölgesidir ve seçimi açan düğmenin erişilebilir açıklamasıdır", () => {
    render(<Harness error={HATA} />);
    const hata = screen.getByRole("alert");
    expect(hata).toHaveTextContent(HATA);
    expect(hata.id).not.toBe("");
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toHaveAccessibleDescription(HATA);
  });

  it("dolu durum: 'Ürün / hizmet ekle' düğmesinin açıklamasıdır", () => {
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} error={HATA} />);
    expect(screen.getByRole("alert")).toHaveTextContent(HATA);
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })).toHaveAccessibleDescription(HATA);
  });

  it("hata yokken uyarı bölgesi ve açıklama yok", () => {
    render(<Harness />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).not.toHaveAttribute("aria-describedby");
  });

  it("aynı sayfadaki iki seçici (Ayarlar: alış + satış) ayrı kimlik taşır", () => {
    render(
      <>
        <Harness error={HATA} />
        <Harness error="İkinci hata" />
      </>,
    );
    const [a, b] = screen.getAllByRole("alert");
    expect(a.id).not.toBe(b.id);
    const [ilk, ikinci] = screen.getAllByRole("button", { name: /Ürün \/ hizmet seçin/ });
    expect(ilk).toHaveAccessibleDescription(HATA);
    expect(ikinci).toHaveAccessibleDescription("İkinci hata");
  });
});

// category-5, code-category-5, code-category-12.
describe("CompanyCategoryPicker — adlar: gizli sektör ve yükleme hatası", () => {
  // webcat-6: sektör listesi düşerse ad `by-ids` yedeğinden okunur, pencere de
  // hatayı kendi içinde çizer → genel toast ve 429 tekrarı kapalı.
  it("sektör listesini 'inlineError' ile ister", () => {
    render(<Harness mainIds={["39000000"]} />);
    expect(h.rootsArgs.at(-1)?.[0]).toEqual({ inlineError: true });
  });

  it("gizlenmiş sektörün kayıtlı kodu ham kodla değil adıyla (by-ids) gösterilir", () => {
    h.byIds = (ids) => ({
      data: ids
        .filter((id) => id === "56000000" || id === "56101500")
        .map((id) => ({ id, nameTr: id === "56000000" ? "Mobilya ve Mefruşat" : "Ofis mobilyası" })),
    });
    render(<Harness mainIds={["56000000"]} subIds={["56100000", "56101500"]} />);
    // Sektör adları da aynı istekte sorulur (sektör listesi gizlileri taşımaz).
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual(["56101500", "56000000"]);
    expect(screen.getByText("Mobilya ve Mefruşat")).toBeInTheDocument();
    expect(screen.queryByText("56000000")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Mobilya ve Mefruşat sektörünü ve altındaki seçimleri kaldır",
      }),
    ).toBeInTheDocument();
  });

  it("ad isteği düşerse '…' değil kod + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.byIds = () => ({ data: undefined, isError: true, refetch });
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.getByText("39121600")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "39121600 seçimini kaldır" })).toBeInTheDocument();
    // Sektör adı listeden gelmeye devam eder.
    expect(screen.getByText("Elektrik Malzemeleri")).toBeInTheDocument();
    expect(screen.getByText("Seçimlerinizin adları yüklenemedi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(h.byIdsArgs.at(-1)?.[1]).toEqual({ inlineError: true });
  });

  it("ad yüklenirken '…' (kod değil); hata satırı yok", () => {
    h.byIds = () => ({ data: undefined });
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("39121600")).toBeNull();
    expect(screen.queryByText("Seçimlerinizin adları yüklenemedi.")).toBeNull();
  });
});
