// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/kayit",
}));

import { ConsentRows, type Consents } from "../consent-rows";

const MARKETING = "Rothern'in kampanya ve tanıtımlarına ilişkin ticari elektronik ileti almak istiyorum (isteğe bağlı)";

function Harness({ requiredError }: { requiredError?: string | null }) {
  const [c, setC] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
  });
  return <ConsentRows consents={c} onChange={setC} requiredError={requiredError} />;
}

/**
 * Arayüz testi O-120 / D-158: satır metnine tıklamak kutuyu işaretler;
 * sözleşme bağlantısına tıklamak kutuyu DEĞİŞTİRMEZ; bağlantı yeni sekmede
 * `rel="noopener noreferrer"` ile açılır.
 */
describe("ConsentRows", () => {
  it("metne tıklamak kutuyu işaretler/kaldırır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: MARKETING });
    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText(MARKETING));
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByText(MARKETING));
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("sözleşme bağlantısı kutuyu değiştirmez ve rel=noopener taşır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini okudum ve kabul ediyorum" });
    const link = screen.getByRole("link", { name: "Kullanıcı sözleşmesini oku" });
    expect(link).toHaveAttribute("href", "/sozlesmeler/kullanici");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom gezinmesin
    await user.click(link);
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  /**
   * Mobil denetim 2026-10 (g03-auth-consent-link): bağlantı etiketin içindeyken
   * telefonda etiketin ortasına dokunmak sözleşmeyi yeni sekmede açıyor, kutu
   * işaretlenmiyordu. Etiket artık bağlantı taşımaz; belge bağlantısı etiketin
   * DIŞINDA, kendi satırında; kutunun dokunma hedefi büyütülmüş.
   */
  it("etiket bağlantı taşımaz: sözleşme adına dokunmak kutuyu işaretler, belge bağlantısı ayrı satırda", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const rows = [
      ["Kullanıcı sözleşmesini okudum ve kabul ediyorum", "Kullanıcı sözleşmesini oku", "/sozlesmeler/kullanici"],
      ["Platform aracılık ve kullanım sözleşmesini kabul ediyorum", "Aracılık sözleşmesini oku", "/sozlesmeler/aracilik"],
      ["KVKK Aydınlatma Metni bilgilendirmesini okudum", "Aydınlatma metnini oku", "/sozlesmeler/kvkk"],
    ] as const;
    for (const [name, linkName, href] of rows) {
      const box = screen.getByRole("checkbox", { name });
      const label = document.getElementById(box.getAttribute("aria-labelledby") ?? "") as HTMLElement;
      expect(label).not.toBeNull();
      expect(label.querySelector("a")).toBeNull();
      const link = screen.getByRole("link", { name: linkName });
      expect(link).toHaveAttribute("href", href);
      expect(label.contains(link)).toBe(false);
      // Etiketin altında (2. sütun, 2. satır) ve en az 32 px yüksek.
      expect(link.className).toMatch(/(^|\s)col-start-2(\s|$)/);
      expect(link.className).toMatch(/(^|\s)row-start-2(\s|$)/);
      expect(link.className).toMatch(/(^|\s)min-h-8(\s|$)/);
      // Kutunun dokunma hedefi görünmeyen çerçeveyle büyür.
      expect(box.className).toMatch(/(^|\s)relative(\s|$)/);
      expect(box.className).toMatch(/(^|\s)after:absolute(\s|$)/);
      expect(box.className).toMatch(/(^|\s)after:-left-3(\s|$)/);
      // Izgara satırı boyunca uzamaz (uzasa çerçeve alttaki bağlantıya binerdi).
      expect(box.className).toMatch(/(^|\s)self-start(\s|$)/);
    }
    // Sözleşme adının kendisine (eskiden bağlantıydı) tıklamak artık işaretler.
    const terms = screen.getByRole("checkbox", { name: rows[0][0] });
    await user.click(screen.getByText(/Kullanıcı sözleşmesini okudum/));
    expect(terms).toHaveAttribute("aria-checked", "true");
    // İsteğe bağlı satırların belgesi yok: bağlantı sayısı üç.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("hata iletisi belge bağlantısının altında (3. satır); belgesiz satırda 2. satır", () => {
    render(<Harness requiredError="Bu onay gereklidir." />);
    for (const msg of screen.getAllByText("Bu onay gereklidir.")) {
      expect(msg.className).toMatch(/(^|\s)row-start-3(\s|$)/);
    }
  });

  // Arayüz testi 2026-10 signup-tr-8: işaretlenmemiş ZORUNLU kutu hatalı
  // işaretlenir ve iletisi kutuya bağlanır; isteğe bağlı kutular hata almaz.
  it("requiredError: işaretsiz zorunlu kutular aria-invalid + bağlı ileti; işaretlenince kalkar", async () => {
    const user = userEvent.setup();
    render(<Harness requiredError="Bu onay gereklidir." />);
    const required = [
      screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini okudum ve kabul ediyorum" }),
      screen.getByRole("checkbox", { name: "Platform aracılık ve kullanım sözleşmesini kabul ediyorum" }),
      screen.getByRole("checkbox", { name: "KVKK Aydınlatma Metni bilgilendirmesini okudum" }),
    ];
    for (const box of required) {
      expect(box).toHaveAttribute("aria-invalid", "true");
      expect(box).toHaveAccessibleDescription("Bu onay gereklidir.");
    }
    {
      const box = screen.getByRole("checkbox", { name: MARKETING });
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.getAllByText("Bu onay gereklidir.")).toHaveLength(3);

    await user.click(required[0]);
    expect(required[0]).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByText("Bu onay gereklidir.")).toHaveLength(2);
  });

  /* 2026-10-16 (kullanıcı kararı): yurt dışına aktarımın dayanağı KVKK m.9/4-c
     standart sözleşmedir. Zorunlu KVKK kutusu yalnız aydınlatma metninin
     okunduğunu bildirir: sağlayıcı listesi, aktarım ya da rıza sözü taşımaz
     (eskiden kayıt formunda "(yurt dışı sağlayıcılar: …)" parantezi vardı). */
  it("zorunlu KVKK kutusu yalnız okunduğunu bildirir; aktarım / sağlayıcı / rıza sözü yok, rıza yalnız isteğe bağlı satırlarda", () => {
    render(<Harness requiredError="Bu onay gereklidir." />);
    const kvkk = screen.getByRole("checkbox", { name: "KVKK Aydınlatma Metni bilgilendirmesini okudum" });
    const label = document.getElementById(kvkk.getAttribute("aria-labelledby") ?? "")!;
    expect(label.textContent).toBe("KVKK Aydınlatma Metni bilgilendirmesini okudum");
    expect(label.textContent).not.toMatch(/yurt dışı|aktarım|rıza|Supabase|Google|Apple/i);
    // Zorunlu üç kutu: hiçbiri rıza/aktarım sözü taşımaz.
    for (const box of screen.getAllByRole("checkbox").filter((b) => b.getAttribute("aria-invalid") === "true")) {
      const l = document.getElementById(box.getAttribute("aria-labelledby") ?? "")!;
      expect(l.textContent).not.toMatch(/yurt dışı|aktarım|rıza/i);
    }
    // İsteğe bağlı TEK kutu "(isteğe bağlı)" der ve zorunlu değildir.
    expect(screen.getByRole("checkbox", { name: MARKETING })).not.toHaveAttribute("aria-invalid");
    expect(document.body.textContent).not.toMatch(/Supabase|Vercel|Cloudflare/);
  });

  /* İnceleme 2026-10-16: "Profil ve hizmet iyileştirme" kutusu kaldırıldı (ona
     dayanan işleme yoktu, rıza belirli bir konuya ilişkin değildi); ticari ileti
     kutusu belirli amacı söyler, "analitik" sözü taşımaz. */
  it("isteğe bağlı tek kutu: belirli amaçlı ticari ileti onayı; profil iyileştirme ve analitik yok", () => {
    render(<Harness />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/Profil ve hizmet iyileştirme|analitik/i);
    expect(screen.getByRole("checkbox", { name: MARKETING })).toHaveAttribute("aria-checked", "false");
  });

  it("requiredError verilmezse hiçbir kutu hatalı değildir (davet kabul formu)", () => {
    render(<Harness />);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toHaveAttribute("aria-invalid");
  });
});
