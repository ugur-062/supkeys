// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { avatarInitials, avatarHash, AVATAR_PASTELS } from "@/lib/avatar-utils";
import { Avatar } from "../avatar";
import { Badge } from "../badge";
import { Breadcrumb } from "../breadcrumb";
import { Chip } from "../chip";
import { pageSlots } from "../pagination";

describe("pageSlots — 7 yuva", () => {
  it("toplam ≤ 7 → hepsi", () => {
    expect(pageSlots(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("baştayken 1 2 3 4 5 … N", () => {
    expect(pageSlots(1, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
    expect(pageSlots(4, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
  });
  it("ortadayken 1 … c-1 c c+1 … N", () => {
    expect(pageSlots(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });
  it("sondayken 1 … N-4 … N", () => {
    expect(pageSlots(19, 20)).toEqual([1, "…", 16, 17, 18, 19, 20]);
  });
  it("her zaman 7 yuva (N > 7)", () => {
    for (let c = 1; c <= 30; c += 1) expect(pageSlots(c, 30)).toHaveLength(7);
  });
});

describe("Avatar monogram", () => {
  // 2026-09-27: büyük harf ADIN diline göre — Türkçe harfli adda Türkçe kural
  // ("iş makine" → "İM"), Türkçe harfsiz adda dilden bağımsız ("ivan petrov" →
  // "IP"; `tr-TR` sabitken "İP" oluyordu). Büyük harfle yazılmış "İzmir" korunur.
  it("büyük harf adın diline göre; tek kelime ilk iki harf", () => {
    expect(avatarInitials("İzmir Demir")).toBe("İD");
    expect(avatarInitials("iş makine")).toBe("İM");
    expect(avatarInitials("ivan petrov")).toBe("IP");
    expect(avatarInitials("ışık")).toBe("IŞ");
  });
  it("aynı ad aynı pastel (deterministik), farklı adlar dağılır", () => {
    const a = avatarHash("Samsun Oluklu Mukavva") % AVATAR_PASTELS.length;
    expect(avatarHash("Samsun Oluklu Mukavva") % AVATAR_PASTELS.length).toBe(a);
    render(<Avatar name="Samsun Oluklu Mukavva" size={48} />);
    const el = screen.getByRole("img", { name: "Samsun Oluklu Mukavva" });
    expect(el.textContent).toBe("SO");
    expect(el.className).toContain(AVATAR_PASTELS[a]!.bg);
  });
});

describe("Badge / Breadcrumb", () => {
  it("verified rozeti ikon taşır, neutral taşımaz", () => {
    const { container } = render(
      <>
        <Badge tone="verified">Doğrulanmış</Badge>
        <Badge tone="neutral">Üretici</Badge>
      </>,
    );
    const badges = container.querySelectorAll("span");
    expect(badges[0]!.querySelector("svg")).not.toBeNull();
    expect(badges[1]!.querySelector("svg")).toBeNull();
  });
  it("kırıntıda son öğe aria-current=page, öncekiler bağlantı", () => {
    render(<Breadcrumb items={[{ label: "Anasayfa", href: "/" }, { label: "Ürünler", href: "/urunler" }, { label: "Pano" }]} />);
    expect(screen.getByText("Pano").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Ürünler" }).getAttribute("href")).toBe("/urunler");
  });

  /* 2026-10-10: halkalar genişlik tavanıyla "…" ile kesilir (bağlantı 192 px,
     bulunulan sayfa 224 / 320 px). Ürün sayfasında sektör halkası "İş Güvenliği
     ve Yangın Ekip…" kalıyor, tam ad hiçbir yerden okunamıyordu. jsdom yerleşim
     hesaplamaz; kilitlenen şey tavanı olan öğenin tam etiketi `title` olarak
     taşımasıdır (kesilip kesilmediği tarayıcıda görülür). */
  it("kısalan kırıntının tam adı `title`da: tavanlı bağlantı ve bulunulan sayfa", () => {
    const sector = "İş Güvenliği ve Yangın Ekipmanları";
    const product = "Kesilmeye dayanıklı, nitril kaplı, EN 388 belgeli iş eldiveni (12 çift)";
    render(
      <Breadcrumb
        home={{ href: "/" }}
        items={[
          { label: sector, href: "/urunler/kategori/46000000-is-guvenligi-ve-yangin-ekipmanlari" },
          { label: "Acme İş Güvenliği A.Ş.", href: "/firma/acme" },
          { label: product },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: sector });
    // Tavan + kesme yerinde; tam ad `title`da.
    expect(link.className.split(/\s+/)).toEqual(expect.arrayContaining(["max-w-[12rem]", "truncate"]));
    expect(link).toHaveAttribute("title", sector);
    expect(screen.getByRole("link", { name: "Acme İş Güvenliği A.Ş." })).toHaveAttribute("title", "Acme İş Güvenliği A.Ş.");
    const current = screen.getByText(product);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className.split(/\s+/)).toContain("truncate");
    expect(current).toHaveAttribute("title", product);
    // Kesilen HER öğe (tavanı olan) title taşır — biri unutulursa burada görünür.
    const crumb = screen.getByRole("navigation", { name: "Yol" });
    for (const el of crumb.querySelectorAll(".truncate")) expect(el.getAttribute("title")).toBe(el.textContent);
    expect(crumb.querySelectorAll(".truncate")).toHaveLength(3);
    // Ev ikonu kesilmez (adı `sr-only` metinde) — ona `title` yazılmaz.
    expect(screen.getByRole("link", { name: "Anasayfa" })).not.toHaveAttribute("title");
  });

  it("bağlantısız ara halka (href yok) da tavanlıdır ve tam adını `title`da taşır", () => {
    render(<Breadcrumb items={[{ label: "Makine ve Ekipman Kiralama Hizmetleri" }, { label: "Pano" }]} />);
    const mid = screen.getByText("Makine ve Ekipman Kiralama Hizmetleri");
    expect(mid).not.toHaveAttribute("aria-current");
    expect(mid).toHaveAttribute("title", "Makine ve Ekipman Kiralama Hizmetleri");
  });
});

describe("Chip — dar ekranda uzun etiket (arayüz testi O-114)", () => {
  it("çip kapsayıcıyı aşamaz, metin kısalır ve tam ad `title`da; × düğmesi küçülmez", () => {
    const long = "Elektrik Sistemleri, Aydınlatma, Bileşenleri ve Aksesuarları ile Elektrik Malzemeleri";
    render(
      <Chip onRemove={() => {}} removeLabel="kaldır">
        {long}
      </Chip>,
    );
    const label = screen.getByText(long);
    expect(label.className).toContain("truncate");
    expect(label.getAttribute("title")).toBe(long);
    const chip = label.parentElement!;
    expect(chip.className).toContain("max-w-full");
    expect(chip.className).toContain("min-w-0");
    expect(screen.getByRole("button", { name: "kaldır" }).className).toContain("shrink-0");
  });
});
