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
  /**
   * Pencere "Onayla"ya basınca dönen seçim kümesinin TAMAMI: tamamı beyan
   * edilen sektörlerin kodu (L1) + diğer dallardaki en derin kodlar.
   */
  secim: [] as string[],
  sonDeger: null as { mainIds: string[]; subIds: string[] } | null,
  /** Sahte pencereye geçen son özellikler. */
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
        { id: "22000000", nameTr: "Sağlık" },
        { id: "23000000", nameTr: "Bilişim" },
        { id: "24000000", nameTr: "Büro" },
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

// Pencere ağır (1000+ satır, katalog uçlarına gider) ve kendi sözleşmesi
// `category-selector-modal.test.tsx` içinde. Burada sınanan şey seçim ARAYÜZÜ
// değil: pencereye GİDEN küme (kayıtlı değerden) ve onaydan SONRAKİ türetme.
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
              const e = validate?.(h.secim) ?? null;
              if (e) setHata(e);
              else onConfirm(h.secim);
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
  h.secim = [];
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
    h.secim = ["39121600", "39131700"];
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
    h.secim = ["39121600", "23211500"];
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ }));
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));

    expect(h.sonDeger?.mainIds.sort()).toEqual(["23000000", "39000000"]);
  });

  it("tavan aşılırsa seçim UYGULANMAZ ve gerekçe yazılır", async () => {
    const user = userEvent.setup();
    // Altı ayrı segment — tavan 5.
    h.secim = [
      "39121600",
      "40121600",
      "41121600",
      "22121600",
      "23121600",
      "24121600",
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
        mainIds={["39000000", "23000000"]}
        subIds={["39121600", "23211500"]}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Elektrik Malzemeleri sektörünü ve altındaki seçimleri kaldır/,
      }),
    );

    expect(h.sonDeger).toEqual({
      mainIds: ["23000000"],
      subIds: ["23211500"],
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

  it("pencerede bir sektörün seçimleri kaldırılırsa sektör de düşer; öksüz kayıt kalmaz", async () => {
    const user = userEvent.setup();
    h.secim = ["23211500"]; // 39'un altındaki seçim kaldırıldı
    render(
      <Harness
        mainIds={["39000000", "23000000"]}
        subIds={["39121600", "23211500"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));

    expect(h.sonDeger?.mainIds).toEqual(["23000000"]);
    expect(h.sonDeger?.subIds.sort()).toEqual(["23210000", "23211500"]);
  });
});

/**
 * SEKTÖRÜN TAMAMI — TEK PENCERE (2026-10-08, kullanıcı: "üst başlıktan
 * seçemiyorlar"). Sektör artık ürün/hizmetle AYNI pencerede işaretlenir; ayrı
 * "Sektör geneli ekle" bağlantısı ve ikinci pencere yok.
 *
 * Değer sözleşmesi DEĞİŞMEDİ ve API'nin aldığı şekil budur: "sektörün tamamı"
 * = sektör kodu `mainIds`te, o sektörden hiçbir kod `subIds`te yok. Bu blok
 * iki yönü de kilitler: kayıtlı değer pencereye doğru kümeyle gider, pencereden
 * dönen küme aynı şekle çevrilir.
 */
describe("CompanyCategoryPicker — sektörün tamamı aynı pencerede", () => {
  async function ac(user: ReturnType<typeof userEvent.setup>, dolu = true) {
    await user.click(
      screen.getByRole("button", { name: dolu ? /Ürün \/ hizmet ekle/ : /Ürün \/ hizmet seçin/ }),
    );
    await screen.findByTestId("alt-modal");
  }
  const onayla = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "alt-onayla" }));

  it("ayrı 'Sektör geneli ekle' bağlantısı yok: tek ekleme düğmesi + kısa ipucu", () => {
    const IPUCU = "Sektörün tamamını da seçebilirsiniz.";
    const { unmount } = render(<Harness />);
    // Boş durum: tek düğme; ipucu düğmenin içinde.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toHaveTextContent(IPUCU);
    expect(screen.queryByRole("button", { name: /Sektör geneli/ })).toBeNull();
    unmount();

    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    // Dolu durum: iki kaldırma düğmesi + TEK ekleme düğmesi.
    expect(
      screen.getAllByRole("button").filter((b) => !/kaldır/.test(b.getAttribute("aria-label") ?? "")),
    ).toEqual([screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ })]);
    expect(screen.queryByRole("button", { name: /Sektör geneli/ })).toBeNull();
    expect(screen.getByText(IPUCU)).toBeInTheDocument();
  });

  it("pencere her seviyeyi işaretletir: sektör dahil, iki tavanla (5 sektör + 50 ürün/hizmet)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await ac(user, false);
    expect(h.modalProps).toMatchObject({
      catalog: "full",
      mode: "multi",
      // Sektör satırı da onay kutusu taşır (= sektörün tamamı).
      minSelectableLevel: 1,
      singlePickPerBranch: true,
      // 50 = sektör ALTINDAKİ seçim; 5 = toplam sektör.
      maxSelection: 50,
      maxSectors: 5,
      limitMessage: "En fazla 50 ürün/hizmet seçebilirsiniz.",
      description: "Sektörün tamamını ya da altındaki ürün ve hizmetleri işaretleyin.",
    });
  });

  it("işaretlenen sektör ana eksene yazılır, alt eksen o sektörde BOŞ kalır (API'nin aldığı şekil)", async () => {
    const user = userEvent.setup();
    h.secim = ["39000000"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: ["39000000"], subIds: [] });
  });

  it("sektörün tamamı + başka sektörden ürün: ikisi de ana eksende, zincir yalnız ürünün", async () => {
    const user = userEvent.setup();
    h.secim = ["40000000", "39121600"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(h.sonDeger).toEqual({
      mainIds: ["40000000", "39000000"],
      subIds: ["39120000", "39121600"],
    });
  });

  it("kayıtlı değer pencereye doğru açılır: tamamı beyan edilen sektör KOD olarak, diğerleri en derin kodla", async () => {
    const user = userEvent.setup();
    // 39: türetilmiş (altında seçim var) · 40: tamamı · 23: türetilmiş, iki seçim.
    render(
      <Harness
        mainIds={["39000000", "40000000", "23000000"]}
        subIds={["39120000", "39121600", "39121614", "23210000", "23211500", "23220000"]}
      />,
    );
    await ac(user);
    // Kartlarla aynı sıra; ata zinciri (3912…, 391216…, 2321…) pencereye gitmez.
    expect(h.modalProps?.value).toEqual(["39121614", "40000000", "23211500", "23220000"]);
  });

  it("eski kayıt biçimleri de doğru açılır: zinciri yazılmamış yaprak, sektörü eksik seçim; gizli sektör pencereye GİTMEZ", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Harness mainIds={["39000000", "23000000"]} subIds={["39121600", "23211500"]} />,
    );
    await ac(user);
    expect(h.modalProps?.value).toEqual(["39121600", "23211500"]);
    unmount();

    // Sektörü ana eksende olmayan seçim: kartı çizilir, pencereye de gider.
    const eksik = render(<Harness mainIds={[]} subIds={["39120000", "39121600"]} />);
    await ac(user);
    expect(h.modalProps?.value).toEqual(["39121600"]);
    eksik.unmount();

    // Gizlenmiş sektörün tamamı (2026-10-09): beyan BOŞ durumla açılır ve
    // pencereye hiçbir kod gitmez — gizli sektör seçim şeridinde çip olmaz.
    render(<Harness mainIds={["56000000"]} />);
    await ac(user, false);
    expect(h.modalProps?.value).toEqual([]);
  });

  it("sektörün tamamı, altından bir seçimle değiştirilince sektör türetilmiş olur (ana eksende kalır)", async () => {
    const user = userEvent.setup();
    h.secim = ["40101500"];
    render(<Harness mainIds={["40000000"]} />);
    await ac(user);
    await onayla(user);
    expect(h.sonDeger).toEqual({
      mainIds: ["40000000"],
      subIds: ["40100000", "40101500"],
    });
  });

  it("alt seçimler sektörün tamamıyla değiştirilince alt eksen o sektörde boşalır", async () => {
    const user = userEvent.setup();
    h.secim = ["39000000", "23211500"];
    render(
      <Harness
        mainIds={["39000000", "23000000"]}
        subIds={["39120000", "39121600", "39130000", "39131700", "23210000", "23211500"]}
      />,
    );
    await ac(user);
    await onayla(user);
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "23000000"],
      subIds: ["23210000", "23211500"],
    });
  });

  it("kartta sektörün tamamı adıyla söylenir; ürün çipi çizilmez", () => {
    render(
      <Harness mainIds={["39000000", "40000000"]} subIds={["39120000", "39121600"]} />,
    );
    const tamami = screen.getByText("Sektörün tamamı — bu sektördeki bütün ürün ve hizmetleri kapsar.");
    // Yalnız tamamı beyan edilen sektörün (40) kartında.
    expect(screen.getAllByText(/Sektörün tamamı —/)).toHaveLength(1);
    const kart = tamami.closest("li") as HTMLElement;
    expect(kart).toHaveTextContent("Dağıtım Sistemleri");
    expect(kart.querySelectorAll('button[aria-label$="seçimini kaldır"]')).toHaveLength(0);
    // Uzun cümle dar kartta sarılır, taşmaz.
    expect(tamami.className).toContain("break-words");
  });

  it("çip kaldırılırken tamamı beyan edilmiş diğer sektör korunur", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        mainIds={["40000000", "39000000"]}
        subIds={["39120000", "39121600", "39130000", "39131700"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Yaprak 39131700 seçimini kaldır/ }));
    expect(h.sonDeger).toEqual({
      mainIds: ["40000000", "39000000"],
      subIds: ["39120000", "39121600"],
    });
  });

  // Tavanlar: sektör işareti ürün/hizmet DEĞİLDİR.
  it("50'lik tavan sektör ALTINDAKİ seçimleri sayar: 50 seçim + 2 sektör işareti onaylanır, 51 seçim reddedilir", async () => {
    const user = userEvent.setup();
    // Tek sektörden (31) 50 ayrı sınıf.
    const elli = Array.from({ length: 50 }, (_, i) => `3116${String(10 + i)}00`);
    h.secim = ["39000000", "40000000", ...elli];
    const { unmount } = render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(screen.queryByTestId("modal-hata")).toBeNull();
    expect(h.sonDeger?.mainIds).toEqual(["39000000", "40000000", "31000000"]);
    unmount();

    h.sonDeger = null;
    h.secim = ["39000000", ...elli, "31170000"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(screen.getByTestId("modal-hata")).toHaveTextContent("En fazla 50 ürün/hizmet seçebilirsiniz.");
    expect(h.sonDeger).toBeNull();
  });

  it("5'lik tavan işaretli sektörleri ve diğer seçimlerin sektörlerini BİRLİKTE sayar", async () => {
    const user = userEvent.setup();
    // Dört sektörün tamamı + beşinci sektörden bir ürün = 5 → geçer.
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23211500"];
    const { unmount } = render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(h.sonDeger?.mainIds).toHaveLength(5);
    unmount();

    // Beş sektörün tamamı + altıncı sektörden bir ürün = 6 → reddedilir.
    h.sonDeger = null;
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23000000", "24121600"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(screen.getByTestId("modal-hata")).toHaveTextContent(
      "Seçimleriniz 6 ayrı sektöre yayılıyor; en fazla 5 sektör beyan edilebilir.",
    );
    expect(h.sonDeger).toBeNull();
  });

  // Pencere `value` her değiştiğinde taslağını ona sıfırlar. Küme adlara bağlı
  // kurulsaydı ad isteği yanıtlandığında (ya da her yeniden çizimde) yeni bir
  // dizi doğar, kullanıcının penceredeki işaretleri silinirdi.
  it("pencereye giden küme yeniden çizimde AYNI dizidir (açık pencerenin taslağı sıfırlanmaz)", async () => {
    const user = userEvent.setup();
    const mainIds = ["39000000", "40000000"];
    const subIds = ["39120000", "39121600"];
    h.byIds = () => ({ data: undefined });
    const { rerender } = render(<Harness mainIds={mainIds} subIds={subIds} />);
    await ac(user);
    const ilk = h.modalProps?.value;
    expect(ilk).toEqual(["39121600", "40000000"]);

    // Adlar geldi → seçici yeniden çizilir.
    h.byIds = (ids) => ({ data: ids.map((id) => ({ id, nameTr: `Ad ${id}` })) });
    rerender(<Harness mainIds={mainIds} subIds={subIds} />);
    expect(screen.getByText("Ad 39121600")).toBeInTheDocument();
    expect(h.modalProps?.value).toBe(ilk);
  });
});

// Kayıt denetimi 2026-10 (category-6/-13/-14, code-category-3/-7): firma beyanı
// aile (L2) seçebilir. (Pencereye geçen özellikler — seviye, dal kuralı,
// tavanlar — yukarıdaki "sektörün tamamı aynı pencerede" bloğunda kilitli.)
describe("CompanyCategoryPicker — aile (L2) seçimi", () => {
  it("aile (L2) seçimi: segment ana eksene, aile alt eksene yazılır ve çip olarak görünür", async () => {
    const user = userEvent.setup();
    h.secim = ["39120000"];
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
    const ekle = screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ });
    expect(ekle.className).toMatch(/\bmin-h-8\b/);
    // Düğme küçülmez; yanındaki ipucu dar ekranda sarılır ve taşmaz.
    expect(ekle.className).toContain("shrink-0");
    expect((ekle.parentElement as HTMLElement).className).toContain("flex-wrap");
    const ipucu = ekle.nextElementSibling as HTMLElement;
    expect(ipucu.className).toContain("min-w-0");
    expect(ipucu.className).toContain("break-words");
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
        mainIds={["39000000", "23000000", "24000000"]}
        subIds={["39120000", "39121600", "23210000", "23211500"]}
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

// webcat-7 (açık bulgu code-category-6): türetme tamamı beyan edilen sektörleri
// başa alıyordu. Pencereyi hiçbir şeye dokunmadan onaylamak `mainIds`i yeni
// sırayla döndürüyor; Ayarlar dizileri sıralı karşılaştırdığı için form
// kirleniyor, "Kaydet" açılıyor ve sayfadan çıkış uyarısı çıkıyordu.
describe("CompanyCategoryPicker — değişmeyen beyan onChange üretmez; kayıtlı sıra korunur", () => {
  // 40'ın tamamı beyan edilmiş (altında seçim yok); 39'un altında tek seçim.
  const KAYITLI = {
    mainIds: ["39000000", "40000000"],
    subIds: ["39120000", "39121000", "39121001"],
  };

  it("pencere hiçbir şeye dokunmadan onaylanırsa onChange çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<Harness {...KAYITLI} />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await screen.findByTestId("alt-modal");
    // Pencere kendisine verilen kümeyi aynen geri verir.
    h.secim = [...(h.modalProps?.value as string[])];
    expect(h.secim).toEqual(["39121001", "40000000"]);
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toBeNull();
  });

  it("aynı seçimler farklı sırayla dönerse de onChange çağrılmaz (sıra farkı değişiklik değildir)", async () => {
    const user = userEvent.setup();
    h.secim = ["40000000", "39131700", "39121600"];
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
    h.secim = ["23211500", "39121001", "40000000"];
    render(<Harness {...KAYITLI} />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "40000000", "23000000"],
      subIds: ["39120000", "39121000", "39121001", "23210000", "23211500"],
    });
  });

  it("çip kaldırınca tamamı beyan edilen sektörün kartı başa geçmez", async () => {
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

  it("pencereden eklenen sektör (tamamı) sona gelir; kayıtlı sıra korunur", async () => {
    const user = userEvent.setup();
    // 23'ün tamamı kayıtlı; 24'ün tamamı pencerede en başta işaretlendi.
    h.secim = ["24000000", "23000000", "39121600"];
    render(<Harness mainIds={["39000000", "23000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await user.click(await screen.findByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "23000000", "24000000"],
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

  // GİZLİ KATEGORİ (2026-10-09, sahip kararı: "anasayfada olmayan kategori başka
  // yerde de gösterilmesin"). 2026-10-08'e dek gizli sektörün kayıtlı kodu
  // `by-ids` yedeğinden adıyla kart olarak çiziliyordu; artık firmanın KENDİ
  // ekranında da çizilmez, adı sorulmaz, tavana sayılmaz.
  //
  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" adıyla
  // GÖRÜNÜR; yalnız silah ve kolluk dalları gizli. Beyan seçimi ata zinciriyle
  // saklar: hafif silah (46101500) seçmiş firmanın kaydında 46000000 +
  // 46100000 + 46101500 durur. Yalnız gizli kodları düşürmek geride sektör
  // kodunu bırakır ve altı boş sektör "sektörün tamamı" diye çizilirdi.
  const GIZLI_AD = (ids: string[]) => ({
    // Eski API gizli kodun adını hâlâ döndürse bile ekrana çıkmamalı.
    data: ids.map((id) => ({
      id,
      nameTr:
        id === "46000000"
          ? "İş Güvenliği ve Yangın Ekipmanları"
          : id === "46101500"
            ? "Ateşli silahlar"
            : id === "46181500"
              ? "Koruyucu giysi"
              : `Yaprak ${id}`,
    })),
  });

  it("gizli daldaki eski beyan çizilmez: görünür atası (sektör) da kart olmaz; ad yok, ham kod yok; adı da sorulmaz", () => {
    h.byIds = GIZLI_AD;
    render(
      <Harness
        mainIds={["46000000", "39000000"]}
        subIds={["46100000", "46101500", "39120000", "39121600"]}
      />,
    );
    // Yalnız görünür sektörün kartı ve seçimi çizilir.
    expect(screen.getByText("Elektrik Malzemeleri")).toBeInTheDocument();
    expect(screen.getByText("Yaprak 39121600")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/İş Güvenliği|Ateşli silahlar|Sektörün tamamı —/)).toBeNull();
    expect(screen.queryByText(/46000000|46101500|46100000/)).toBeNull();
    // Ad isteği gizli kodu da yalnız onun atası olan sektörü de içermez.
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual(["39121600", "39000000"]);
  });

  it("yalnız gizli seçim (ve ata zinciri) olan beyan BOŞ durumla açılır (güncel kategori seçtirir)", () => {
    h.byIds = GIZLI_AD;
    render(<Harness mainIds={["46000000"]} subIds={["46100000", "46101500"]} />);
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText(/İş Güvenliği|Ateşli silahlar|4610|4600/)).toBeNull();
  });

  it("gizli SINIF seçimi (461825): görünür ailesi ve sektörü yalnız onun atasıysa çizilmez", () => {
    h.byIds = GIZLI_AD;
    render(<Harness mainIds={["46000000"]} subIds={["46180000", "46182500", "46182501"]} />);
    expect(screen.getByRole("button", { name: /Ürün \/ hizmet seçin/ })).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("46 görünür sektör: 'sektörün tamamı' beyanı kart olarak çizilir ve pencereye sektör kodu gider", async () => {
    const user = userEvent.setup();
    h.byIds = GIZLI_AD;
    render(<Harness mainIds={["46000000"]} />);
    expect(screen.getByText("İş Güvenliği ve Yangın Ekipmanları")).toBeInTheDocument();
    expect(screen.getByText(/^Sektörün tamamı —/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await screen.findByTestId("alt-modal");
    expect(h.modalProps?.value).toEqual(["46000000"]);
  });

  it("46'da görünür ve gizli seçim birlikte: kart yalnız görünür seçimi çizer, sayar ve pencereye yollar", async () => {
    const user = userEvent.setup();
    h.byIds = GIZLI_AD;
    render(
      <Harness
        mainIds={["46000000"]}
        subIds={["46100000", "46101500", "46180000", "46181500", "46182500", "46182501"]}
      />,
    );
    expect(screen.getByText("İş Güvenliği ve Yangın Ekipmanları")).toBeInTheDocument();
    expect(screen.getByText("Koruyucu giysi")).toBeInTheDocument();
    // Sektörün altında bir görünür seçim var → "sektörün tamamı" DEĞİL.
    expect(screen.queryByText(/^Sektörün tamamı —/)).toBeNull();
    expect(screen.queryByText(/Ateşli silahlar|46101500|46182501/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /seçimini kaldır/ })).toHaveLength(1);
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual(["46181500", "46000000"]);
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await screen.findByTestId("alt-modal");
    expect(h.modalProps?.value).toEqual(["46181500"]);
    // Görünür seçim kaldırılınca sektör de düşer: gizli seçim onu "tamamı" beyanına çevirmez.
    await user.click(screen.getByRole("button", { name: "Koruyucu giysi seçimini kaldır" }));
    expect(h.sonDeger).toEqual({ mainIds: [], subIds: [] });
  });

  it("eksen değişince gizli kodlar ve yalnız onların atası olan sektör dönen değerden düşer; dokunulmadıkça onChange çağrılmaz", async () => {
    const user = userEvent.setup();
    h.byIds = GIZLI_AD;
    render(
      <Harness
        mainIds={["46000000", "39000000"]}
        subIds={["46100000", "46101500", "39120000", "39121600"]}
      />,
    );
    // Pencereye yalnız görünür seçim gider; aynı kümeyle onaylamak kayıt üretmez
    // (gizli kod "değişiklik" sayılmaz — ilgisiz bir kayıt beyanı yeniden yazmaz).
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await screen.findByTestId("alt-modal");
    expect(h.modalProps?.value).toEqual(["39121600"]);
    h.secim = ["39121600"];
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toBeNull();
    // Bir seçim eklenince dönen değer YALNIZ görünür kodlardan kurulur.
    h.secim = ["39121600", "40101500"];
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "40000000"],
      subIds: ["39120000", "39121600", "40100000", "40101500"],
    });
  });

  it("gizli sektör ve yalnız gizli seçimin atası olan sektör 5'lik sektör tavanına sayılmaz", async () => {
    const user = userEvent.setup();
    // Kayıtta 1 gizli sektör + gizli seçimin atası olan 46 + 4 görünür sektör;
    // beşinci GÖRÜNÜR sektör eklenebilmeli.
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23000000"];
    render(
      <Harness
        mainIds={["77000000", "46000000", "39000000", "40000000", "41000000", "22000000"]}
        subIds={["46100000", "46101500"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Ürün \/ hizmet ekle/ }));
    await screen.findByTestId("alt-modal");
    await user.click(screen.getByRole("button", { name: "alt-onayla" }));
    expect(screen.queryByTestId("modal-hata")).toBeNull();
    expect(h.sonDeger?.mainIds).toEqual(["39000000", "40000000", "41000000", "22000000", "23000000"]);
  });

  it("ad cevabı geldiği hâlde satırı olmayan seçim çizilmez ('…' asılı kalmaz, ham kod basılmaz)", () => {
    // 39121700 katalogda yok: cevap yalnız 39121600'ü döndürür.
    h.byIds = (ids) => ({ data: ids.filter((id) => id === "39121600").map((id) => ({ id, nameTr: `Yaprak ${id}` })) });
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600", "39121700"]} />);
    expect(screen.getByText("Yaprak 39121600")).toBeInTheDocument();
    expect(screen.queryByText("39121700")).toBeNull();
    expect(screen.queryByText("…")).toBeNull();
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
