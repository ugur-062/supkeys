// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AudienceProvider } from "@/components/marketplace/audience-switch";
import { HomeHero } from "@/components/marketplace/home-hero";
import { HomeBuyer } from "@/components/marketplace/home-buyer";
import { HomeSupplier } from "@/components/marketplace/home-supplier";

const product = (i: number) => ({
  slug: `urun-${i}`,
  name: `Ürün ${i}`,
  categoryId: "39000000",
  images: [],
  priceMode: "ON_REQUEST" as const,
  company: { slug: `firma-${i}`, name: `Firma ${i}`, city: "Bursa", verified: true, activities: [] },
});

const demand = (i: number) => ({
  number: `ROT-00010${i}`,
  title: `Talep ${i}`,
  status: "OPEN",
  closesAt: new Date(Date.now() + i * 86_400_000).toISOString(),
  categories: [{ id: "39000000", name: "Elektrik", level: 1 }],
  itemSummary: { count: 2, totalQuantity: "500", unit: "adet" },
  company: { city: "Bursa", country: "TR", activities: ["MANUFACTURER"], verified: true },
  scope: "DOMESTIC",
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const hero = () => render(<AudienceProvider><HomeHero /></AudienceProvider>);

// Taraf tercihi `localStorage`ta yaşıyor ve jsdom onu dosya boyunca TAŞIR:
// temizlenmezse bir testteki "Tedarikçiyim" tıklaması sonraki testleri de
// tedarikçi yüzünde başlatır.
beforeEach(() => window.localStorage.clear());

describe("Anasayfa — panel ekranlarının anonim hâli", () => {
  it("sunucu varsayılanı ALICI yüzü: soru, mavi 'Ara', Ürün|Tedarikçi kapsamı", () => {
    hero();
    expect(screen.getByRole("heading", { level: 1, name: /Hangi ürün için/ })).toBeInTheDocument();
    const ara = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    expect(ara.className).toContain("bg-blue-600");
    // Kapsam pilleri `aria-pressed` düğmesi (radyo değil): ikisi de tek
    // formun hedefini değiştirir, seçim bir grup içi durum.
    const kapsam = screen.getByRole("group", { name: "Arama kapsamı" });
    expect(within(kapsam).getByRole("button", { name: "Ürün" })).toHaveAttribute("aria-pressed", "true");
    expect(within(kapsam).getByRole("button", { name: "Tedarikçi" })).toBeInTheDocument();
  });

  it("anahtar TEDARİKÇİ yüzüne geçirir: talep sorusu, yeşil 'Ara', kapsam anahtarı yok", async () => {
    const user = userEvent.setup();
    hero();
    await user.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(screen.getByRole("heading", { level: 1, name: /Hangi talebe/ })).toBeInTheDocument();
    const ara = screen
      .getAllByRole("button", { name: /^Ara/ })
      .find((b) => b.getAttribute("type") === "submit") as HTMLElement;
    expect(ara.className).toContain("bg-emerald-700");
    // Ürün|Tedarikçi kapsamı yalnız alıcı yüzünde — talep aramasında karşılığı yok.
    expect(screen.queryByRole("group", { name: "Arama kapsamı" })).toBeNull();
  });

  it("AI ile ara ANONİMDE ÇİZİLMEZ (Silver+ ∧ koltuk izni ister)", async () => {
    const user = userEvent.setup();
    hero();
    expect(screen.queryByRole("button", { name: /AI ile ara/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(screen.queryByRole("button", { name: /AI ile ara/ })).toBeNull();
  });

  it("birincil eylemler PANELE değil KAYDA gider (niyetiyle)", async () => {
    const user = userEvent.setup();
    hero();
    expect(screen.getByRole("link", { name: /Talep aç/ })).toHaveAttribute(
      "href",
      "/company/kayit?intent=talep",
    );
    await user.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(screen.getByRole("link", { name: /Ücretsiz kaydolun/ })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif",
    );
  });

  it("ALICI gövdesi: 'size uygun' YOK — ziyaretçinin kategorisi yok, ölçülebilir kesit var", () => {
    render(
      <HomeBuyer
        featured={[product(1)] as any}
        newest={[product(2)] as any}
        showcase={[{ id: "39000000", name: "Elektrik", count: 5, imageSrc: null } as any]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Öne çıkan ürünler" })).toBeInTheDocument();
    expect(screen.queryByText(/Size uygun/)).toBeNull();
    expect(screen.queryByText(/Alım kategorilerinizle/)).toBeNull();
    // Ürün bağlantısı HERKESE AÇIK rota — panel rotası sızmamalı.
    const link = screen.getAllByRole("link", { name: /Ürün 1/ })[0];
    expect(link).toHaveAttribute("href", "/firma/firma-1/urun/urun-1");
  });

  it("kategori kartı: ürünü OLMAYAN dal 404 veren sayfaya değil süzülmüş dizine gider", () => {
    render(
      <HomeBuyer
        featured={[] as any}
        newest={[] as any}
        showcase={[
          { id: "39000000", name: "Elektrik", count: 5, imageSrc: null },
          { id: "10000000", name: "Canlı Bitki", count: 0, imageSrc: null },
        ] as any}
      />,
    );
    expect(screen.getAllByRole("link", { name: /Elektrik/ })[0]).toHaveAttribute(
      "href",
      "/urunler/kategori/39000000-elektrik",
    );
    expect(screen.getAllByRole("link", { name: /Canlı Bitki/ })[0]).toHaveAttribute(
      "href",
      "/urunler?kategori=10000000",
    );
  });

  it("TEDARİKÇİ gövdesi: talep kartı alıcı adını ve kalem adlarını TAŞIMAZ", () => {
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />);
    const list = screen.getByRole("heading", { name: /Alıcılar şu an/ }).closest("section")!;
    expect(within(list).getByRole("link", { name: /Tüm talepler \(16\)/ })).toBeInTheDocument();
    // Kapalı zarf: kart yalnız ölçek ve kapsam taşır.
    expect(within(list).queryByText(/Firma /)).toBeNull();
    expect(within(list).getAllByText(/kalem adları ve şartname üyelere/).length).toBe(3);
  });

  it("TEDARİKÇİ gövdesi: üye verisi (KPI, sağlık kartları, uygunluk) YOK", () => {
    render(<HomeSupplier demands={[demand(1), demand(2), demand(3)] as any} total={16} />);
    for (const s of ["Davetlisiniz", "Ürününüzle eşleşti", "Profil tamamlanma", "Teklif verdiniz"]) {
      expect(screen.queryByText(s)).toBeNull();
    }
  });

  it("üç talepten AZ ise ızgara çizilmez — boş pazar görüntüsü basılmaz", () => {
    render(<HomeSupplier demands={[demand(1)] as any} total={1} />);
    expect(screen.queryByRole("link", { name: /Tüm talepler/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Ücretsiz kaydolun" })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif",
    );
  });
});
