// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CountryCombobox } from "../country-combobox";

function Harness({ codes, initial = "TR" }: { codes?: string[]; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <CountryCombobox value={v} onChange={setV} codes={codes} ariaLabel="Ülke" />
      <output data-testid="val">{v}</output>
    </>
  );
}

describe("CountryCombobox (2026-09-27, kayıt tüm ülkelere açık)", () => {
  it("Türkçe karakterden bağımsız adla arar ve seçer", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "ozbek");
    await user.click(await screen.findByRole("option", { name: /Özbekistan/ }));
    expect(screen.getByTestId("val")).toHaveTextContent("UZ");
  });

  it("ISO koduyla da bulur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "lk");
    expect(await screen.findByRole("option", { name: /Sri Lanka/ })).toBeInTheDocument();
  });

  it("bayrak emoji değil SVG: seçili ülke kutunun solunda, seçeneklerde ad yanında (2026-10-04)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    // Kutu değeri yalnız ad — emoji ("🇹🇷") Windows'ta "TR" harfleri olarak basılıyordu.
    expect(box).toHaveValue("Türkiye");
    expect(container.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
    await user.clear(box);
    await user.type(box, "azerb");
    const opt = await screen.findByRole("option", { name: /Azerbaycan/ });
    expect(opt.querySelector('img[src="/flags/4x3/az.svg"]')).not.toBeNull();
    expect(opt.textContent ?? "").not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    // Arama yazılırken kutudaki metin seçili ülke değil → soldaki bayrak gizli.
    expect(container.querySelector('[data-slot="control"] img')).toBeNull();
  });

  // Kayıt denetimi 2026-10 signup-tr-12: satırda "KKTC" yazıyor ama "kktc"
  // araması "Eşleşen ülke yok" diyordu; rozet 20 px'lik bayrak kutusundan
  // taşıp bayraklardan solda başlıyor ve ülke adına yapışıyordu.
  it("KKTC kısaltmayla da bulunur ve rozeti bayraklarla aynı hizada, aynı boşlukla durur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    for (const q of ["kktc", "KKTC", "trnc", "трск"]) {
      await user.clear(box);
      await user.type(box, q);
      expect(await screen.findByRole("option", { name: /Kuzey Kıbrıs Türk Cumhuriyeti/ })).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(1);
    }
    await user.clear(box);
    await user.type(box, "kıbrıs");
    const kktc = await screen.findByRole("option", { name: /Kuzey Kıbrıs Türk Cumhuriyeti/ });
    const cyprus = screen.getByRole("option", { name: /^Kıbrıs$/ });
    const slot = (opt: HTMLElement) => opt.firstElementChild as HTMLElement;
    // Rozet metin, bayrak görsel — ikisi de aynı kutu kuralında.
    expect(slot(kktc).textContent).toBe("KKTC");
    expect(slot(cyprus).querySelector('img[src="/flags/4x3/cy.svg"]')).not.toBeNull();
    for (const opt of [kktc, cyprus]) {
      // Kutu içeriği kadar geniş (sabit genişlik + ortalama YOK): sol kenar
      // satırın başında, ada uzaklık satırın ortak boşluğu (gap-2).
      expect(slot(opt)).toHaveClass("min-w-4", "shrink-0");
      expect(slot(opt).className).not.toMatch(/(^|\s)w-5(\s|$)|justify-center/);
      expect(opt).toHaveClass("gap-2");
    }
  });

  it("KKTC seçiliyken kutuya rozet çizilmez (ad zaten yazıyor; rozet bayrak dolgusuna sığmaz)", () => {
    const { container } = render(<Harness initial="XN" />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    expect(box).toHaveValue("Kuzey Kıbrıs Türk Cumhuriyeti");
    expect(container.querySelector('[data-slot="control"]')?.textContent ?? "").not.toContain("KKTC");
    // Bayrak dolgusu yalnız bayrak çizilirken.
    expect(box.className).not.toMatch(/(^|\s)pl-9(\s|$)/);
  });

  it("invalid: kutu hatalı işaretlenir (aria-invalid + kırmızı çerçeve)", () => {
    const { rerender } = render(<CountryCombobox value="" onChange={() => {}} ariaLabel="Ülke" invalid />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveClass("border-red-500");
    rerender(<CountryCombobox value="" onChange={() => {}} ariaLabel="Ülke" />);
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveClass("border-red-500");
  });

  it("izin verilmeyen kod (kayda kapalı ülke) listede çıkmaz", async () => {
    const user = userEvent.setup();
    render(<Harness codes={["TR", "DE"]} />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "amerika");
    expect(screen.queryByRole("option", { name: /Amerika/ })).not.toBeInTheDocument();
  });

  // Son toparlama 2026-10-04: liste tembel çizilir (Headless UI'da 245 seçenek
  // birden kaydedilince açılış/arama yavaştı).
  it("açık liste ilk sayfayla çizilir, dibe kaydırınca büyür; arama tüm ülkelerde yapılır", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    const list = await screen.findByRole("listbox");
    expect(screen.getAllByRole("option")).toHaveLength(60);
    // Dibe yakın kaydırma → bir sayfa daha.
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 288 });
    list.scrollTop = 1700;
    fireEvent.scroll(list);
    expect(screen.getAllByRole("option")).toHaveLength(120);
    // Çizilmemiş sayfadaki ülke de aramayla bulunur.
    await user.type(box, "zimba");
    expect(await screen.findByRole("option", { name: /Zimbabve/ })).toBeInTheDocument();
  });

  it("seçili ülke ilk sayfanın ötesindeyken de tek dip kaydırması bir sayfa ekler", async () => {
    const user = userEvent.setup();
    render(<Harness initial="MX" />);
    await user.click(screen.getByRole("button", { name: "Ülke listesini aç" }));
    const list = await screen.findByRole("listbox");
    const before = screen.getAllByRole("option").length;
    // Seçili Meksika ilk 60 satırın ötesinde → çizilen satır `limit`ten fazla.
    expect(before).toBeGreaterThan(60);
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 5000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 288 });
    list.scrollTop = 4700;
    fireEvent.scroll(list);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(before);
  });

  it("listenin sonlarındaki seçili ülke açılışta çizilen aralıkta (işaretli) gelir", async () => {
    const user = userEvent.setup();
    render(<Harness initial="ZW" />);
    await user.click(screen.getByRole("button", { name: "Ülke listesini aç" }));
    const opt = await screen.findByRole("option", { name: /Zimbabve/ });
    expect(opt).toHaveAttribute("aria-selected", "true");
  });
});
