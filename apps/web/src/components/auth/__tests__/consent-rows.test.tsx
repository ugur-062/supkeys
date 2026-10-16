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

function Harness({ requiredError }: { requiredError?: string | null }) {
  const [c, setC] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
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
    const box = screen.getByRole("checkbox", { name: "Pazarlama ve analitik / ticari ileti (opsiyonel)" });
    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Pazarlama ve analitik / ticari ileti (opsiyonel)"));
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByText("Pazarlama ve analitik / ticari ileti (opsiyonel)"));
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
    for (const name of ["Profil ve hizmet iyileştirme (opsiyonel)", "Pazarlama ve analitik / ticari ileti (opsiyonel)"]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.getAllByText("Bu onay gereklidir.")).toHaveLength(3);

    await user.click(required[0]);
    expect(required[0]).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByText("Bu onay gereklidir.")).toHaveLength(2);
  });

  it("requiredError verilmezse hiçbir kutu hatalı değildir (davet kabul formu)", () => {
    render(<Harness />);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toHaveAttribute("aria-invalid");
  });
});
