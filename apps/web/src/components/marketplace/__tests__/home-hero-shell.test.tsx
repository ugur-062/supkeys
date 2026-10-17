// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * KABUK ↔ HERO KUTU SÖZLEŞMESİ (son canlı kontrol 2026-10-10, NEW-04).
 *
 * Anasayfanın sunucu HTML'i hero'nun yerine `HeroShell`i basar (hero
 * `useSearchParams` okur, statik sayfada istemciye ertelenir). Bant içeriğini
 * dikeyde ortalar: kabuk hero'dan kısaysa başlık hidrasyonda zıplar. Eskiden
 * kabukta yalnız başlık ve alt cümle vardı; arama formu (92 px) ve not
 * (56–84 px) hidrasyonda belirince başlık 68–92 px yukarı kayıyordu.
 *
 * jsdom yerleşim hesaplamaz; burada sınanan şey yüksekliği belirleyen YAPI ve
 * SINIFLARdır: iki taraf aynı sırada aynı yuvaları, aynı kutu sınıflarıyla
 * taşır. Hero'ya yükseklik katan bir parça eklenip kabuğa eklenmezse (ya da
 * bir kutu sınıfı tek tarafta değişirse) bu dosya kırmızıya döner.
 */
const h = vi.hoisted(() => ({ suspend: false, pending: new Promise<never>(() => {}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // Statik üretimde `useSearchParams` sınırı istemciye erteler ve sunucu HTML'ine
  // yedek (kabuk) düşer; testte aynı sonucu askıya alarak elde ediyoruz.
  useSearchParams: () => {
    if (h.suspend) throw h.pending;
    return new URLSearchParams("");
  },
  usePathname: () => "/",
}));
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AudienceProvider } from "@/components/marketplace/audience-switch";
import { HomeHero } from "@/components/marketplace/home-hero";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

function HeroPage() {
  return (
    <AudienceProvider>
      <HomeHero />
    </AudienceProvider>
  );
}

/** Hidrasyon öncesi: sınır askıda → `HomeHero`nun GERÇEK yedeği (kabuk) çizilir. */
function renderShell(): HTMLElement {
  h.suspend = true;
  const { container } = render(<HeroPage />);
  return container.querySelector("section") as HTMLElement;
}
/** Hidrasyon sonrası: tedarikçi yüzü (varsayılan) ya da kayıtlı tercihle alıcı yüzü. */
function renderHero(face: "supplier" | "buyer" = "supplier"): HTMLElement {
  h.suspend = false;
  if (face === "buyer") window.localStorage.setItem("rothern.audience", "buyer");
  else window.localStorage.removeItem("rothern.audience");
  const { container } = render(<HeroPage />);
  return container.querySelector("section") as HTMLElement;
}

const tokens = (el: Element) => [...el.classList].sort();
/* Yalnız BOYAMA sınıfları (renk, görünürlük, geçiş, gölge, çerçeve halkası,
   köşe) — kutunun ölçüsünü değiştirmezler; gerisi karşılaştırılır. */
const PAINT =
  /^(?:invisible|transition|rounded-\w+|text-(?:white|zinc-\d+)|bg-white|shadow-[\w/-]+|(?:focus-within:)?ring-[\w/-]+|(?:hover:|focus-visible:)?(?:bg|outline)-(?:emerald|blue)-\d+)$/;
const box = (el: Element) => tokens(el).filter((c) => !PAINT.test(c));
/** Yükseklik sınıfları (`h-12` gibi). */
const heights = (els: Element[]) => [...new Set(els.flatMap((el) => tokens(el).filter((c) => /^h-/.test(c))))].sort();

function parts(section: HTMLElement) {
  const [decor, column, ...rest] = [...section.children] as HTMLElement[];
  const [title, lead, search, note, ...extra] = [...column!.children] as HTMLElement[];
  return { decor: decor!, column: column!, rest, title: title!, lead: lead!, search: search!, note: note!, extra };
}

beforeEach(() => {
  window.localStorage.clear();
  h.suspend = false;
});

describe("Anasayfa hero'su — hidrasyon öncesi kabuk hero ile aynı yeri tutar (NEW-04)", () => {
  it("bant, dekor ve sütun birebir aynı", () => {
    const shell = parts(renderShell());
    const hero = parts(renderHero());
    const [shellSection, heroSection] = [shell.column.parentElement!, hero.column.parentElement!];

    expect(tokens(shellSection)).toEqual(tokens(heroSection));
    expect(shellSection.getAttribute("aria-label")).toBe(heroSection.getAttribute("aria-label"));
    // Dekor aynı bileşen, aynı girdi: hidrasyonda kart belirmez / kaybolmaz.
    expect(shell.decor.outerHTML).toBe(hero.decor.outerHTML);
    expect(tokens(shell.column)).toEqual(tokens(hero.column));
    // Bandın doğrudan çocukları: dekor + sütun; başka bir şey yok.
    expect(shell.rest).toHaveLength(0);
    expect(hero.rest).toHaveLength(0);
  });

  it("sütunda aynı DÖRT yuva, aynı sırada: başlık · alt cümle · arama · not", () => {
    const shell = parts(renderShell());
    const hero = parts(renderHero());
    // Hero'ya beşinci bir parça eklenirse kabuk da onu taşımalı.
    expect(shell.column.children).toHaveLength(4);
    expect(hero.column.children).toHaveLength(shell.column.children.length);
    expect(shell.extra).toHaveLength(0);
    expect(hero.extra).toHaveLength(0);
    expect(hero.search.tagName).toBe("FORM");
    expect(shell.search.tagName).toBe("DIV");
  });

  it("başlık ve alt cümle yuvaları: aynı ızgara, aynı sınıflar, aynı metin ve aynı ölçü metni", () => {
    const shell = parts(renderShell());
    const hero = parts(renderHero());
    for (const slot of ["title", "lead"] as const) {
      const [s, x] = [shell[slot], hero[slot]];
      expect(tokens(s)).toEqual(tokens(x));
      expect(s.children).toHaveLength(2);
      expect(x.children).toHaveLength(2);
      for (const i of [0, 1]) {
        const [a, b] = [s.children[i]!, x.children[i]!];
        expect(a.tagName).toBe(b.tagName);
        expect(tokens(a)).toEqual(tokens(b));
        expect(a.textContent).toBe(b.textContent);
        expect(a.getAttribute("aria-hidden")).toBe(b.getAttribute("aria-hidden"));
      }
    }
    // Başlığın üst boşluğu iki tarafta da var (kabukta yoktu: 12 px fark).
    expect(shell.title.querySelector("h1")!.className).toContain("mt-3");
    expect(hero.title.querySelector("h1")!.className).toContain("mt-3");
    // Sayfanın tek başlığı; ölçü kopyası başlık değil.
    expect(within(shell.column).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(shell.title.querySelector("h1")!.textContent).toBe("Yeni siparişler bulun");
  });

  it("arama yuvası: kabuktaki yer tutucu formun üst boşluğunu, çubuğun iç boşluğunu ve alan yüksekliğini taşır", () => {
    const shell = parts(renderShell());
    const hero = parts(renderHero());
    // Form ↔ yer tutucu: aynı kutu sınıfları (üst boşluk dahil).
    expect(box(shell.search)).toEqual(box(hero.search));
    expect(box(hero.search)).toContain("mt-7");
    // Çubuk: formun tek çocuğu (kapsam pili / AI notu yok) ↔ yer tutucunun tek çocuğu.
    expect(hero.search.children).toHaveLength(1);
    expect(shell.search.children).toHaveLength(1);
    const [shellBar, heroBar] = [shell.search.firstElementChild!, hero.search.firstElementChild!];
    expect(box(shellBar)).toEqual(box(heroBar));
    expect(box(heroBar)).toContain("p-2");
    // Çubuğun yüksekliğini içindeki denetimler verir: alan ve "Ara" düğmesi.
    const controls = [...heroBar.querySelectorAll("input, button")];
    expect(controls.length).toBeGreaterThanOrEqual(2);
    expect(heights(controls)).toEqual(["h-12"]);
    expect(heights([...shellBar.children])).toEqual(heights(controls));
  });

  it("not yuvası: aynı ızgara; görünen not ile ölçü notu aynı kutu sınıfları ve aynı metinle yer tutar", () => {
    const shell = parts(renderShell());
    const hero = parts(renderHero());
    expect(tokens(shell.note)).toEqual(tokens(hero.note));
    expect(shell.note.children).toHaveLength(2);
    expect(hero.note.children).toHaveLength(2);
    for (const i of [0, 1]) {
      const [a, b] = [shell.note.children[i]!, hero.note.children[i]!];
      expect(box(a)).toEqual(box(b));
      expect(a.textContent).toBe(b.textContent);
      // Hap düğme: hero'da bağlantı (ya da ölçü kopyası), kabukta düz kutu — aynı ölçü.
      const [pillA, pillB] = [a.lastElementChild!, b.lastElementChild!];
      expect(box(pillA)).toEqual(box(pillB));
      expect(box(pillB)).toEqual(expect.arrayContaining(["px-4", "py-2", "text-sm"]));
      expect(tokens(pillA.querySelector("svg")!)).toEqual(tokens(pillB.querySelector("svg")!));
    }
    // Tedarikçi yüzünün misafir notu görünen hücrede, alıcınınki ölçü hücresinde.
    expect(hero.note.children[0]!.textContent).toBe("Taleplere teklif vermek tamamen ücretsizÜcretsiz kaydolun");
    expect(hero.note.children[1]!.textContent).toBe(
      "Aradığınız ürünü bulamadınız mı? Alım talebi açmak ücretsiz.Talep aç",
    );
  });

  it("kabukta etkileşimli parça yok: form, alan, düğme ve bağlantı hidrasyonla gelir", () => {
    const shell = parts(renderShell());
    const section = shell.column.parentElement!;
    expect(section.querySelector('form, input, textarea, select, button, a, [role="search"], [tabindex]')).toBeNull();
    // Yer tutucular görünmez ve yardımcı teknolojiden gizli.
    for (const el of [shell.search, shell.note.children[0]!, shell.note.children[1]!]) {
      expect(el.getAttribute("aria-hidden")).toBe("true");
      expect(el.className).toContain("invisible");
    }
    // Hero'da aynı yerde gerçek denetimler var.
    const hero = parts(renderHero());
    expect(hero.search.querySelector('input[type="search"]')).not.toBeNull();
    expect(hero.note.querySelector("a")).not.toBeNull();
  });
});

/**
 * OTURUMLU ÜYE (kapanış kontrolü 2026-10-10, CL-01). Sunucu HTML'i her zaman
 * misafir hâlidir: kabuk not yuvasını iki yüzün MİSAFİR notuyla ayırır. Üyenin
 * notu hidrasyondan sonra başka (etiketi farklı) ya da HİÇ yok olabilir (izni
 * yok). Eskiden notu olmayan yüz yuvayı hiç çizmiyordu: görüntüleyicide başlık
 * ve arama kutusu hidrasyonda 28–52 px, yalnız satınalma / yalnız satış rolünde
 * yüz geçişinde 28–42 px oynuyordu.
 *
 * Kural: hero'nun not yuvası HER rolde ve HER yüzde durur; kabuğun ölçtüğü iki
 * misafir notunu (görünen not olarak ya da görünmez ölçü olarak) taşır; iki yüz
 * aynı not kümesini ölçer.
 */
describe("Anasayfa hero'su — oturumlu üyede not yuvası kabuğun ayırdığı yerde kalır (CL-01)", () => {
  const GUEST_SUPPLIER = "Taleplere teklif vermek tamamen ücretsizÜcretsiz kaydolun";
  const GUEST_BUYER = "Aradığınız ürünü bulamadınız mı? Alım talebi açmak ücretsiz.Talep aç";
  const signIn = (permissions: string[]) =>
    useCompanyAuthStore.setState({
      isHydrated: true,
      user: { id: "u", permissions, roles: [] } as never,
      company: { tier: "GOLD", companyVerificationStatus: "VERIFIED" } as never,
    });
  const cells = (slot: HTMLElement) => [...slot.children] as HTMLElement[];
  const texts = (slot: HTMLElement) => cells(slot).map((c) => c.textContent ?? "").sort();

  afterEach(() => {
    useCompanyAuthStore.setState({ user: null, company: null });
  });

  it.each([
    // [rol, izinler, tedarikçi yüzünde not var mı, alıcı yüzünde not var mı]
    ["görüntüleyici (iki yüzde de not yok)", ["buy:view", "sell:view"], false, false],
    ["yalnız satış (alıcı yüzünde not yok)", ["sell:view", "sell:bid:submit"], true, false],
    ["yalnız satınalma (tedarikçi yüzünde not yok)", ["buy:view", "buy:listing:manage"], false, true],
    ["bütün izinler (iki yüzde de not var)", ["buy:view", "buy:listing:manage", "sell:view", "sell:bid:submit"], true, true],
  ])("%s: yuva iki yüzde de durur, kabuğun ölçtüğü notları taşır, iki yüz aynı kümeyi ölçer", (_role, permissions, supplierNote, buyerNote) => {
    signIn(permissions);
    // Kabuk üyede de misafir yuvasıdır (sunucu oturumu tanımaz).
    const shell = parts(renderShell());
    expect(texts(shell.note)).toEqual([GUEST_BUYER, GUEST_SUPPLIER].sort());

    const faces = { supplier: parts(renderHero("supplier")), buyer: parts(renderHero("buyer")) };
    expect(faces.supplier.column.parentElement!.getAttribute("aria-label")).toBe("Yeni siparişler bulun");
    expect(faces.buyer.column.parentElement!.getAttribute("aria-label")).toBe("Yeni tedarikçiler bulun");

    for (const [face, visible] of [["supplier", supplierNote], ["buyer", buyerNote]] as const) {
      const hero = faces[face];
      // Dört yuva: not yuvası kaybolmaz (eskiden notu olmayan yüzde üç çocuk kalıyordu).
      expect(hero.column.children).toHaveLength(4);
      expect(hero.extra).toHaveLength(0);
      expect(hero.search.tagName).toBe("FORM");
      // Aynı ızgara; hücreler kabuğun hücreleriyle aynı kutu sınıflarını taşır.
      expect(tokens(hero.note)).toEqual(tokens(shell.note));
      for (const cell of cells(hero.note)) expect(box(cell)).toEqual(box(shell.note.children[0]!));
      // Kabuğun ölçtüğü iki misafir notu da ölçülür → yuva kabuktan kısa olamaz.
      expect(texts(hero.note)).toEqual(expect.arrayContaining([GUEST_SUPPLIER, GUEST_BUYER]));
      // Görünen not en çok bir tane; gerisi görünmez ve yardımcı teknolojiden gizli.
      const shown = cells(hero.note).filter((c) => c.getAttribute("aria-hidden") !== "true");
      expect(shown).toHaveLength(visible ? 1 : 0);
      for (const cell of cells(hero.note)) {
        if (shown.includes(cell)) continue;
        expect(cell.className).toContain("invisible");
        expect(cell.querySelector("a, button")).toBeNull();
      }
      // İzni olmayana çağrı yok: yuvada bağlantı çizilmez.
      expect(hero.note.querySelectorAll("a")).toHaveLength(visible ? 1 : 0);
      // Aynı not iki kez ölçülmez.
      expect(new Set(texts(hero.note)).size).toBe(cells(hero.note).length);
    }
    // İki yüz aynı not kümesini ölçer → yüz geçişinde arama kutusu oynamaz.
    expect(texts(faces.supplier.note)).toEqual(texts(faces.buyer.note));
  });

  it("misafirde yuva değişmedi: görünen not + öteki yüzün notu, başka ölçü yok (iki yüzde)", () => {
    const supplier = parts(renderHero("supplier"));
    expect(cells(supplier.note).map((c) => c.textContent)).toEqual([GUEST_SUPPLIER, GUEST_BUYER]);
    const buyer = parts(renderHero("buyer"));
    expect(cells(buyer.note).map((c) => c.textContent)).toEqual([GUEST_BUYER, GUEST_SUPPLIER]);
  });
});
