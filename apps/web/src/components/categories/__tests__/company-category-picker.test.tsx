// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FİRMA KATEGORİ SEÇİCİSİ — YALNIZ SEKTÖR (sahip kararı 2026-10-29, S1/S2).
 *
 * Kayıt 2. adımı ve Ayarlar › Firma Bilgileri › Kategoriler yalnız sektör
 * (L1) sorar, en fazla 5. Ürün / hizmet (L2-L4) seçimi o pencerede yok;
 * mevcut alt seçimler temizlik betiğiyle silinir ve API yeni alt seçim
 * saklamaz. Bu dosya seçicinin sözleşmesini kilitler: pencereye GİDEN küme
 * (kayıtlı değerden, eski kayıt dahil), onaydan SONRA dönen değer (alt eksen
 * hep boş), çipler, tavan ve gizli kategori kuralı.
 */

const h = vi.hoisted(() => ({
  /** Pencere "Onayla"ya basınca dönen seçim kümesinin TAMAMI. */
  secim: [] as string[],
  sonDeger: null as { mainIds: string[]; subIds: string[] } | null,
  /** Sahte pencereye geçen son özellikler. */
  modalProps: null as Record<string, unknown> | null,
  /** `by-ids` cevabı — null ise varsayılan (sektör kodu → "Ad <kod>"). */
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
        { id: "31000000", nameTr: "Üretim Bileşenleri" },
      ],
    };
  },
  useCategoriesByIds: (...args: unknown[]) => {
    h.byIdsArgs.push(args);
    const ids = args[0] as string[];
    if (h.byIds) return h.byIds(ids);
    return { data: ids.map((id) => ({ id, nameTr: `Ad ${id}` })) };
  },
}));

// Pencere ağır (1000+ satır, katalog uçlarına gider) ve kendi sözleşmesi
// `category-selector-modal.test.tsx` içinde ("yalnız sektör kipi"). Burada
// sınanan şey seçim ARAYÜZÜ değil: pencereye GİDEN küme ve onaydan SONRAKİ
// değer. Sahte modal, gerçeğin onay sözleşmesini taklit eder: önce `validate`,
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
  modalDescription,
}: {
  mainIds?: string[];
  subIds?: string[];
  error?: string;
  modalDescription?: string;
}) {
  return (
    <CompanyCategoryPicker
      value={{ mainIds, subIds }}
      onChange={(v) => {
        h.sonDeger = v;
      }}
      label="Ne satarım"
      hint="test"
      modalTitle="Satış sektörleriniz"
      modalDescription={modalDescription}
      error={error}
    />
  );
}

/** Seçimi gerçekten uygulayan sarmalayıcı — kaldırınca çipin DOM'dan gittiği testler için. */
function Stateful({ mainIds, subIds = [] }: { mainIds: string[]; subIds?: string[] }) {
  const [v, setV] = useState({ mainIds, subIds });
  return (
    <CompanyCategoryPicker
      value={v}
      onChange={setV}
      label="Ne satarım"
      hint="test"
      modalTitle="Satış sektörleriniz"
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

async function ac(user: ReturnType<typeof userEvent.setup>, dolu = true) {
  // Tavanda (5) ve üstünde düğme "Sektörleri düzenle" der.
  await user.click(screen.getByRole("button", { name: dolu ? /Sektör ekle|Sektörleri düzenle/ : /Sektör seçin/ }));
  await screen.findByTestId("alt-modal");
}
const onayla = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "alt-onayla" }));

describe("CompanyCategoryPicker — pencere sözleşmesi (yalnız sektör)", () => {
  it("pencere yalnız sektör kipinde açılır: tek tavan 5 sektör, tam katalog; ürün/hizmet kipinin özellikleri yok", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await ac(user, false);
    expect(h.modalProps).toMatchObject({
      catalog: "full",
      mode: "multi",
      sectorsOnly: true,
      maxSelection: 5,
      title: "Satış sektörleriniz",
      // Arama ipucu pencerede kutunun kendisinde ("Sektör, ürün ya da hizmet
      // ara") ve sonuç listesinde; açıklama tekrarlamaz. Varsayılan açıklama
      // kayıt beyanınındır (alış + satış birlikte).
      description: "Alıp sattığınız ürün ve hizmetlerin sektörlerini işaretleyin.",
    });
    // 2026-10-08 kipinin (sektör + 50 ürün/hizmet) özellikleri artık geçmez.
    for (const prop of ["minSelectableLevel", "singlePickPerBranch", "maxSectors", "limitMessage"]) {
      expect(h.modalProps).not.toHaveProperty(prop);
    }
  });

  it("tek eksenli çağıran kendi pencere açıklamasını verir (Ayarlar › Ne alırım / Ne satarım)", async () => {
    const user = userEvent.setup();
    render(<Harness modalDescription="Sattığınız ürün ve hizmetlerin sektörlerini işaretleyin." />);
    await ac(user, false);
    expect(h.modalProps).toMatchObject({
      description: "Sattığınız ürün ve hizmetlerin sektörlerini işaretleyin.",
    });
  });

  it("boş durum: tek düğme 'Sektör seçin' + ürün/hizmet adıyla arama ipucu", () => {
    render(<Harness />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).toHaveTextContent(
      "Ürün ya da hizmet adıyla arayabilirsiniz.",
    );
    expect(screen.queryByText(/Ürün \/ hizmet/)).toBeNull();
  });

  it("dolu durum: sektör çipleri + TEK 'Sektör ekle' düğmesi; ürün/hizmet çipi ve 'sektörün tamamı' metni yok", () => {
    render(<Harness mainIds={["39000000", "40000000"]} />);
    expect(screen.getByText("Elektrik Malzemeleri")).toBeInTheDocument();
    expect(screen.getByText("Dağıtım Sistemleri")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").filter((b) => !/kaldır/.test(b.getAttribute("aria-label") ?? "")),
    ).toEqual([screen.getByRole("button", { name: /Sektör ekle/ })]);
    expect(screen.getAllByRole("button", { name: /sektörünü kaldır$/ })).toHaveLength(2);
    expect(screen.queryByText(/sektörün tamamı/i)).toBeNull();
    expect(screen.queryByText(/Ürün \/ hizmet/)).toBeNull();
  });

  it("onay: işaretlenen sektörler ana eksene yazılır, alt eksen BOŞ döner (API'nin aldığı şekil)", async () => {
    const user = userEvent.setup();
    h.secim = ["39000000", "23000000"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: ["39000000", "23000000"], subIds: [] });
  });

  it("pencereden sektör dışı kod dönerse sektörüne yuvarlanır; aynı sektör bir kez yazılır", async () => {
    const user = userEvent.setup();
    h.secim = ["39121600", "39000000", "23211500"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: ["39000000", "23000000"], subIds: [] });
  });
});

/**
 * ESKİ KAYIT (S2 temizliği koşmadan önce ya da eski bir taslaktan): sektör +
 * ürün / hizmet seçimleri (ata zinciriyle) kayıtlı. Seçici yalnız SEKTÖRLERİ
 * gösterir ve pencereye yollar; ürün / hizmet çipi çizilmez. Dokunulmayan
 * beyan `onChange` üretmez; dokunulan eksende alt liste BOŞ döner.
 */
describe("CompanyCategoryPicker — eski kayıt (ürün / hizmet seçimi taşıyan beyan)", () => {
  const ESKI = {
    // 39: altında iki seçim (zinciriyle) · 40: sektörün tamamı · 23: altında bir seçim.
    mainIds: ["39000000", "40000000", "23000000"],
    subIds: ["39120000", "39121600", "39121614", "39130000", "39131700", "23210000", "23211500"],
  };

  it("çipler yalnız sektörlerdir (kayıtlı sırayla); ürün/hizmet adı istenmez, çizilmez", () => {
    render(<Harness {...ESKI} />);
    const cipler = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(cipler).toEqual(["Elektrik Malzemeleri", "Dağıtım Sistemleri", "Bilişim"]);
    // Ad isteği yalnız sektör kodlarını taşır.
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual(["39000000", "40000000", "23000000"]);
    expect(screen.queryByText(/Ad 39121614|Ad 23211500/)).toBeNull();
  });

  it("pencereye sektör kodları gider (ürün/hizmet kodu ve ata zinciri gitmez)", async () => {
    const user = userEvent.setup();
    render(<Harness {...ESKI} />);
    await ac(user);
    expect(h.modalProps?.value).toEqual(["39000000", "40000000", "23000000"]);
  });

  it("sektörü ana eksende OLMAYAN eski seçim: sektörü türetilir, çip olur ve pencereye gider", async () => {
    const user = userEvent.setup();
    render(<Harness mainIds={["40000000"]} subIds={["39120000", "39121600"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Dağıtım Sistemleri",
      "Elektrik Malzemeleri",
    ]);
    await ac(user);
    expect(h.modalProps?.value).toEqual(["40000000", "39000000"]);
  });

  it("pencere hiçbir şeye dokunmadan onaylanırsa onChange çağrılmaz (eski alt seçimler formu kirletmez)", async () => {
    const user = userEvent.setup();
    render(<Harness {...ESKI} />);
    await ac(user);
    h.secim = [...(h.modalProps?.value as string[])];
    await onayla(user);
    expect(h.sonDeger).toBeNull();
  });

  it("aynı sektörler farklı sırayla dönerse de onChange çağrılmaz (sıra farkı değişiklik değildir)", async () => {
    const user = userEvent.setup();
    h.secim = ["23000000", "39000000", "40000000"];
    render(<Harness {...ESKI} />);
    await ac(user);
    await onayla(user);
    expect(h.sonDeger).toBeNull();
  });

  it("sektör eklenince kayıtlı sıra korunur, yeni sona gelir; eski alt seçimler düşer (subIds boş)", async () => {
    const user = userEvent.setup();
    h.secim = ["24000000", "23000000", "39000000", "40000000"];
    render(<Harness {...ESKI} />);
    await ac(user);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: ["39000000", "40000000", "23000000", "24000000"], subIds: [] });
  });

  // Ayarlar sözleşmesi: sektör kaldırılınca eksenin alt listesi `[]` gider —
  // gönderilmeseydi API eksik yarıyı depodaki eski seçimlerden doldurup
  // kaldırılan sektörü geri getirebilirdi.
  it("çipten sektör kaldırılınca: kalan sektörler + alt eksen BOŞ", async () => {
    const user = userEvent.setup();
    render(<Harness {...ESKI} />);
    await user.click(screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }));
    expect(h.sonDeger).toEqual({ mainIds: ["40000000", "23000000"], subIds: [] });
  });

  it("pencerede bir sektörün işareti kaldırılınca o sektör düşer; alt eksen BOŞ", async () => {
    const user = userEvent.setup();
    h.secim = ["40000000", "23000000"];
    render(<Harness {...ESKI} />);
    await ac(user);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: ["40000000", "23000000"], subIds: [] });
  });

  it("son sektör kaldırılınca beyan tamamen boşalır", async () => {
    const user = userEvent.setup();
    render(<Harness mainIds={["39000000"]} subIds={["39120000", "39121600"]} />);
    await user.click(screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }));
    expect(h.sonDeger).toEqual({ mainIds: [], subIds: [] });
  });
});

describe("CompanyCategoryPicker — tavan (5 sektör)", () => {
  it("5 sektör onaylanır; 6 sektör reddedilir — modal açık kalır, gerekçe modal içinde", async () => {
    const user = userEvent.setup();
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23000000"];
    const { unmount } = render(<Harness />);
    await ac(user, false);
    await onayla(user);
    expect(screen.queryByTestId("modal-hata")).toBeNull();
    expect(h.sonDeger?.mainIds).toHaveLength(5);
    unmount();

    h.sonDeger = null;
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23000000", "24000000"];
    render(<Harness />);
    await ac(user, false);
    await onayla(user);
    // Sessizce kırpmak, kullanıcının beyanını haberi olmadan eksiltirdi.
    expect(h.sonDeger).toBeNull();
    expect(screen.getByTestId("alt-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-hata")).toHaveTextContent(
      "6 sektör seçili; en fazla 5 sektör beyan edilebilir. Fazla olanları kaldırın.",
    );
  });

  it("tavanın üstündeki eski beyan (Ayarlar eskiden 10 sektöre izin veriyordu) azaltılmadan onaylanamaz", async () => {
    const user = userEvent.setup();
    const yedi = ["39000000", "40000000", "41000000", "22000000", "23000000", "24000000", "31000000"];
    render(<Harness mainIds={yedi} />);
    await ac(user);
    // Pencere kendisine verilen kümeyi aynen döndürür → yine 7.
    h.secim = [...(h.modalProps?.value as string[])];
    await onayla(user);
    expect(screen.getByTestId("modal-hata")).toHaveTextContent("7 sektör seçili");
    expect(h.sonDeger).toBeNull();
    // İkisi kaldırılınca onaylanır.
    h.secim = yedi.slice(0, 5);
    await onayla(user);
    expect(h.sonDeger).toEqual({ mainIds: yedi.slice(0, 5), subIds: [] });
  });

  it("tavanda düğme 'Sektörleri düzenle' der (pencere ekletmez, değiştirtir); altında 'Sektör ekle'", () => {
    const bes = ["39000000", "40000000", "41000000", "22000000", "23000000"];
    const { unmount } = render(<Harness mainIds={bes} />);
    expect(screen.getByRole("button", { name: "Sektörleri düzenle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sektör ekle/ })).toBeNull();
    // Tavanda bir uyarı yok: beyan geçerli.
    expect(screen.queryByText(/beyan edilebilir/)).toBeNull();
    unmount();
    render(<Harness mainIds={bes.slice(0, 4)} />);
    expect(screen.getByRole("button", { name: "Sektör ekle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sektörleri düzenle" })).toBeNull();
  });

  it("tavanın üstündeki eski beyan pencere açılmadan söylenir; çipten kaldırdıkça sayı düşer, tavanda kaybolur", async () => {
    const user = userEvent.setup();
    const yedi = ["39000000", "40000000", "41000000", "22000000", "23000000", "24000000", "31000000"];
    render(<Stateful mainIds={yedi} />);
    const not = screen.getByText("7 sektör seçili; en fazla 5 sektör beyan edilebilir. Fazla olanları kaldırın.");
    // Sayfa açılışında okunmaz (alert değil); seçimi açan düğmenin açıklamasıdır.
    expect(not).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Sektörleri düzenle" })).toHaveAccessibleDescription(not.textContent!);
    await user.click(screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }));
    expect(screen.getByText(/^6 sektör seçili/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dağıtım Sistemleri sektörünü kaldır" }));
    expect(screen.queryByText(/sektör seçili; en fazla/)).toBeNull();
    expect(screen.getByRole("button", { name: "Sektörleri düzenle" })).not.toHaveAttribute("aria-describedby");
  });

  it("çağıranın hatası varken (Ayarlar'ın kayıt kapısı / sunucu reddi) tavan notu ikinci kez yazılmaz", () => {
    const yedi = ["39000000", "40000000", "41000000", "22000000", "23000000", "24000000", "31000000"];
    render(<Harness mainIds={yedi} error="Kayıt kapısı metni" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Kayıt kapısı metni");
    expect(screen.queryByText(/sektör seçili; en fazla/)).toBeNull();
    expect(screen.getByRole("button", { name: "Sektörleri düzenle" })).toHaveAccessibleDescription("Kayıt kapısı metni");
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
    expect(ilk).toEqual(["39000000", "40000000"]);

    // Adlar geldi → seçici yeniden çizilir.
    h.byIds = (ids) => ({ data: ids.map((id) => ({ id, nameTr: `Ad ${id}` })) });
    rerender(<Harness mainIds={mainIds} subIds={subIds} />);
    expect(h.modalProps?.value).toBe(ilk);
  });
});

// category-7/-8/-10, code-category-4, signup-enru-3, signup-tr-22.
describe("CompanyCategoryPicker — çipler ve dokunma hedefleri", () => {
  it("çip adın tamamını gösterir (sabit piksel tavanı yok) ve kutusunun dışına çıkmaz; ikon ezilmez", () => {
    render(<Harness mainIds={["39000000"]} />);
    const ad = screen.getByText("Elektrik Malzemeleri");
    expect(ad.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(ad.className).toContain("break-words");
    const cip = ad.closest("li") as HTMLElement;
    expect(cip.className).toContain("max-w-full");
    expect(cip.className).toContain("min-w-0");
    expect(cip.querySelector("svg")!.getAttribute("class")).toContain("shrink-0");
  });

  it("kaldırma düğmesi sektörü adıyla söyler ve en az 32 px; 'Sektör ekle' en az 32 px, ipucu sarılır", () => {
    render(<Harness mainIds={["39000000"]} />);
    const kaldir = screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" });
    expect(kaldir.className).toMatch(/\bsize-8\b/);
    expect(kaldir.className).toContain("shrink-0");
    const ekle = screen.getByRole("button", { name: /Sektör ekle/ });
    expect(ekle.className).toMatch(/\bmin-h-8\b/);
    expect(ekle.className).toContain("shrink-0");
    expect((ekle.parentElement as HTMLElement).className).toContain("flex-wrap");
    const ipucu = ekle.nextElementSibling as HTMLElement;
    expect(ipucu).toHaveTextContent("Ürün ya da hizmet adıyla arayabilirsiniz.");
    expect(ipucu.className).toContain("min-w-0");
    expect(ipucu.className).toContain("break-words");
  });

  it("devre dışıyken kaldırma ve ekleme düğmesi yok", () => {
    render(
      <CompanyCategoryPicker
        value={{ mainIds: ["39000000"], subIds: [] }}
        onChange={() => {}}
        label="Ne satarım"
        hint="test"
        modalTitle="Satış sektörleriniz"
        disabled
      />,
    );
    expect(screen.getByText("Elektrik Malzemeleri")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("son sektör klavyeyle kaldırılınca odak gövdeye düşmez: boş durum düğmesine geçer", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000"]} />);
    screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).toHaveFocus();
  });

  it("başka sektör kalmışsa klavyeyle kaldırınca odak 'Sektör ekle'ye geçer", async () => {
    const user = userEvent.setup();
    render(<Stateful mainIds={["39000000", "40000000"]} />);
    screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Elektrik Malzemeleri")).toBeNull();
    expect(screen.getByRole("button", { name: /Sektör ekle/ })).toHaveFocus();
  });

  // webcat-1: `focus()` hedefi görünüme kaydırır; fare / dokunmayla kaldırma
  // odağı (ve sayfayı) taşımaz.
  it("fareyle kaldırma odağı taşımaz", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Stateful mainIds={["39000000", "40000000"]} />);
    await user.click(screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }));
    expect(screen.queryByText("Elektrik Malzemeleri")).toBeNull();
    expect(screen.getByRole("button", { name: /Sektör ekle/ })).not.toHaveFocus();
    unmount();

    render(<Stateful mainIds={["39000000"]} />);
    await user.click(screen.getByRole("button", { name: "Elektrik Malzemeleri sektörünü kaldır" }));
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).not.toHaveFocus();
  });
});

// web-auth-2: onboarding "Devam"da odak seçiciye taşınır; hata görünür ama
// rolsüz ve düğmeye bağlı olmadığı için ekran okuyucu yalnız düğmeyi okuyordu.
describe("CompanyCategoryPicker — zorunlu alan hatası ekran okuyucuya söylenir", () => {
  const HATA = "En az bir sektör seçin";

  it("boş durum: hata `alert` bölgesidir ve seçimi açan düğmenin erişilebilir açıklamasıdır", () => {
    render(<Harness error={HATA} />);
    const hata = screen.getByRole("alert");
    expect(hata).toHaveTextContent(HATA);
    expect(hata.id).not.toBe("");
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).toHaveAccessibleDescription(HATA);
  });

  it("dolu durum: 'Sektör ekle' düğmesinin açıklamasıdır", () => {
    render(<Harness mainIds={["39000000"]} error={HATA} />);
    expect(screen.getByRole("alert")).toHaveTextContent(HATA);
    expect(screen.getByRole("button", { name: /Sektör ekle/ })).toHaveAccessibleDescription(HATA);
  });

  it("hata yokken uyarı bölgesi ve açıklama yok", () => {
    render(<Harness />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).not.toHaveAttribute("aria-describedby");
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
    const [ilk, ikinci] = screen.getAllByRole("button", { name: /Sektör seçin/ });
    expect(ilk).toHaveAccessibleDescription(HATA);
    expect(ikinci).toHaveAccessibleDescription("İkinci hata");
  });
});

// category-5, code-category-5, code-category-12.
describe("CompanyCategoryPicker — adlar: gizli kategori ve yükleme hatası", () => {
  // webcat-6: sektör listesi düşerse ad `by-ids` yedeğinden okunur, pencere de
  // hatayı kendi içinde çizer → genel toast ve 429 tekrarı kapalı.
  it("sektör listesini ve ad isteğini 'inlineError' ile ister", () => {
    render(<Harness mainIds={["39000000"]} />);
    expect(h.rootsArgs.at(-1)?.[0]).toEqual({ inlineError: true });
    expect(h.byIdsArgs.at(-1)).toEqual([["39000000"], { inlineError: true }]);
  });

  // GİZLİ KATEGORİ (2026-10-09 / 2026-10-10, sahip kararı). 46 "İş Güvenliği ve
  // Yangın Ekipmanları" görünür; yalnız silah ve kolluk dalları gizli. Beyan
  // seçimi ata zinciriyle saklar: hafif silah (46101500) seçmiş firmanın
  // kaydında 46000000 + 46100000 + 46101500 durur — sektör yalnız gizli
  // seçimin atasıdır ve çip OLMAZ. 77 tümüyle gizli bir sektördür.
  const GIZLI_AD = (ids: string[]) => ({
    // Eski API gizli kodun adını hâlâ döndürse bile ekrana çıkmamalı.
    data: ids.map((id) => ({
      id,
      nameTr:
        id === "46000000"
          ? "İş Güvenliği ve Yangın Ekipmanları"
          : id === "77000000"
            ? "Çevre Hizmetleri"
            : `Ad ${id}`,
    })),
  });

  it("gizli daldaki eski seçim ve yalnız onun atası olan sektör çizilmez, pencereye gitmez, adı sorulmaz", async () => {
    const user = userEvent.setup();
    h.byIds = GIZLI_AD;
    render(
      <Harness
        mainIds={["46000000", "77000000", "39000000"]}
        subIds={["46100000", "46101500", "39120000", "39121600"]}
      />,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Elektrik Malzemeleri"]);
    expect(screen.queryByText(/İş Güvenliği|Çevre Hizmetleri|46000000|77000000/)).toBeNull();
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual(["39000000"]);
    await ac(user);
    expect(h.modalProps?.value).toEqual(["39000000"]);
  });

  it("yalnız gizli beyan taşıyan kayıt BOŞ durumla açılır (güncel sektör seçtirir)", () => {
    h.byIds = GIZLI_AD;
    render(<Harness mainIds={["46000000"]} subIds={["46100000", "46101500"]} />);
    expect(screen.getByRole("button", { name: /Sektör seçin/ })).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    // Gizli SINIF (461825) seçiminin atası olan 46 da çizilmez.
    render(<Harness mainIds={["46000000"]} subIds={["46180000", "46182500", "46182501"]} />);
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("46 görünür sektördür: tek başına ya da görünür bir eski seçimle sektör çipi olur", () => {
    h.byIds = GIZLI_AD;
    const { unmount } = render(<Harness mainIds={["46000000"]} />);
    expect(screen.getByText("İş Güvenliği ve Yangın Ekipmanları")).toBeInTheDocument();
    unmount();
    render(<Harness mainIds={["46000000"]} subIds={["46100000", "46101500", "46180000", "46181500"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["İş Güvenliği ve Yangın Ekipmanları"]);
  });

  it("gizli sektörler tavana sayılmaz; eksen değişince dönen değer yalnız görünür sektörlerdir", async () => {
    const user = userEvent.setup();
    h.byIds = GIZLI_AD;
    h.secim = ["39000000", "40000000", "41000000", "22000000", "23000000"];
    render(
      <Harness
        mainIds={["77000000", "46000000", "39000000", "40000000", "41000000", "22000000"]}
        subIds={["46100000", "46101500"]}
      />,
    );
    await ac(user);
    expect(h.modalProps?.value).toEqual(["39000000", "40000000", "41000000", "22000000"]);
    await onayla(user);
    expect(screen.queryByTestId("modal-hata")).toBeNull();
    expect(h.sonDeger).toEqual({
      mainIds: ["39000000", "40000000", "41000000", "22000000", "23000000"],
      subIds: [],
    });
  });

  it("ad cevabı geldiği hâlde hiçbir kaynakta adı olmayan sektör çizilmez ('…' asılı kalmaz, ham kod basılmaz)", () => {
    // 98000000 sektör listesinde yok, ad cevabı da onu döndürmez.
    h.byIds = (ids) => ({ data: ids.filter((id) => id !== "98000000").map((id) => ({ id, nameTr: `Ad ${id}` })) });
    render(<Harness mainIds={["39000000", "98000000"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Elektrik Malzemeleri"]);
    expect(screen.queryByText("98000000")).toBeNull();
    expect(screen.queryByText("…")).toBeNull();
  });

  it("ad isteği düşerse: listede adı olan sektör adıyla, olmayan KOD + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.byIds = () => ({ data: undefined, isError: true, refetch });
    render(<Harness mainIds={["39000000", "98000000"]} />);
    expect(screen.getByText("Elektrik Malzemeleri")).toBeInTheDocument();
    expect(screen.getByText("98000000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "98000000 sektörünü kaldır" })).toBeInTheDocument();
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.getByText("Sektör adları yüklenemedi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("ad yüklenirken listede olmayan sektör '…' (kod değil); hata satırı yok", () => {
    h.byIds = () => ({ data: undefined });
    render(<Harness mainIds={["98000000"]} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("98000000")).toBeNull();
    expect(screen.queryByText("Sektör adları yüklenemedi.")).toBeNull();
  });
});
