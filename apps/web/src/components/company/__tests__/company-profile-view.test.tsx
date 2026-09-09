// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CompanyProfileView,
  type ProfileViewData,
} from "../company-profile-view";

const base: ProfileViewData = {
  name: "Test Firma",
  industry: "Üretim",
  city: "İstanbul",
  country: "TR",
  logoUrl: null,
  coverImageUrl: null,
  aboutText: null,
  services: [],
  certifications: [],
  certificateImages: [],
  foundedYear: 2020,
  employeeCount: "10-50",
  website: null,
  linkedinUrl: null,
  instagramUrl: null,
};

describe("CompanyProfileView — dış bağlantı XSS koruması", () => {
  it("javascript: website linki RENDER EDİLMEZ", () => {
    render(
      <CompanyProfileView
        profile={{ ...base, website: "javascript:alert(document.cookie)" }}
      />,
    );
    expect(screen.queryByText("Web Sitesi")).toBeNull();
  });

  it("geçerli https website linki render edilir (href normalize)", () => {
    render(
      <CompanyProfileView
        profile={{ ...base, website: "https://example.com" }}
      />,
    );
    const link = screen.getByText("Web Sitesi").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://example.com/");
  });

  it("şemasız website https:// ile normalize edilip render edilir", () => {
    render(<CompanyProfileView profile={{ ...base, website: "foo.com" }} />);
    const link = screen.getByText("Web Sitesi").closest("a");
    expect(link?.getAttribute("href")).toBe("https://foo.com/");
  });
});

describe("CompanyProfileView — doğrulama rozeti", () => {
  it("verified=false → profilde 'Doğrulanmamış' yazar (2026-09-06, ücretsiz vitrin)", () => {
    render(<CompanyProfileView profile={{ ...base, verified: false }} />);
    expect(screen.getByText("Doğrulanmamış")).toBeTruthy();
    expect(screen.queryByText("Doğrulanmış")).toBeNull();
  });

  it("verified=true → 'Doğrulanmış'; bilinmiyorsa (undefined) hiçbiri", () => {
    const { unmount } = render(<CompanyProfileView profile={{ ...base, verified: true }} />);
    expect(screen.getByText("Doğrulanmış")).toBeTruthy();
    expect(screen.queryByText("Doğrulanmamış")).toBeNull();
    unmount();
    render(<CompanyProfileView profile={base} />);
    expect(screen.queryByText("Doğrulanmamış")).toBeNull();
    expect(screen.queryByText("Doğrulanmış")).toBeNull();
  });
});

/**
 * DÜZEN SÖZLEŞMESİ (2026-09-07, kullanıcı kararı — Europages firma sayfası):
 * kimlik ÜSTTE ve KISA, ürünler TAM GENİŞLİKTE ve üstte; künye/sertifika/
 * galeri ürünlerin ALTINDAKİ "hakkında" bölümüne iner.
 */
describe("CompanyProfileView — düzen", () => {
  const rich: ProfileViewData = {
    ...base,
    aboutText: "Uzun tanıtım metni. ".repeat(20),
    activities: ["SERVICE_PROVIDER"],
    certifications: ["ISO 9001"],
    services: ["Kurulum"],
    rothernId: "RTH-1",
  };

  it("üst kart: ülke bayrağı + faaliyet tipi + kısa tanıtım ve 'Daha fazlasını oku' çapası", () => {
    const { container } = render(
      <CompanyProfileView profile={rich} main={<div data-testid="urunler">ürünler</div>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: /Test Firma/ })).toBeInTheDocument();
    expect(screen.getAllByText("Türkiye").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hizmet sağlayıcı").length).toBeGreaterThan(0);
    const more = screen.getByRole("link", { name: "Daha fazlasını oku" });
    expect(more).toHaveAttribute("href", "#hakkinda");
    // Kısa tanıtım İKİ SATIRLA sınırlı; tam metin aşağıdaki bölümde.
    expect(container.querySelector(".line-clamp-2")).not.toBeNull();
  });

  it("başlık kapağın ÜSTÜNE binmez — negatif boşluk YALNIZ logoda", () => {
    // 2026-09-08 kullanıcı bulgusu: uzun ad / iki faaliyet tipi olan firmada
    // metin bloğu yukarı büyüyüp kapak fotoğrafının üstüne çıkıyordu.
    // Negatif üst boşluk satırın tamamındaydı; artık yalnız logo kutusunda.
    const { container } = render(<CompanyProfileView profile={rich} />);
    const h1 = screen.getByRole("heading", { level: 1, name: /Test Firma/ });
    const textBlock = h1.parentElement as HTMLElement;
    expect(textBlock.className).not.toMatch(/-mt-/);
    const row = textBlock.parentElement?.parentElement as HTMLElement;
    expect(row.className).not.toMatch(/-mt-/);
    // Logo kutusu taşmayı TEK BAŞINA yapar.
    expect(container.querySelector('[class*="-mt-12"]')).not.toBeNull();
  });

  it("ürünler 'hakkında' bölümünden ÖNCE ve ızgaranın DIŞINDA (tam genişlik)", () => {
    const { container } = render(
      <CompanyProfileView profile={rich} main={<div data-testid="urunler">ürünler</div>} />,
    );
    const products = screen.getByTestId("urunler");
    const about = container.querySelector("#hakkinda");
    expect(about).not.toBeNull();
    // DOM sırası: ürünler önce.
    expect(products.compareDocumentPosition(about as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Ürünler iki sütunlu ızgaranın içinde DEĞİL (sağdaki künye onu daraltmasın).
    expect(about?.contains(products)).toBe(false);
  });

  it("sertifikalar ve hizmetler SAĞ sütunda değil", () => {
    const { container } = render(<CompanyProfileView profile={rich} />);
    const grid = container.querySelector("#hakkinda");
    const right = grid?.children[1] as HTMLElement | undefined;
    expect(right).toBeTruthy();
    expect(right?.textContent ?? "").not.toContain("ISO 9001");
    expect(right?.textContent ?? "").not.toContain("Kurulum");
    // Sağ sütun künyeyi taşır.
    expect(right?.textContent ?? "").toContain("Şirket Bilgileri");
  });
});
