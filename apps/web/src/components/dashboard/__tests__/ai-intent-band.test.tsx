// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSearchIntentResult } from "@rothern/shared";

const h = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma",
}));

import { AiIntentBand } from "../ai-intent-band";

const intent: AiSearchIntentResult = {
  portal: "satinalma",
  summary: "kompanzasyon panosu, İstanbul",
  query: "kompanzasyon panosu",
  category: { id: "39121500", name: "Kompanzasyon panoları" },
  categoryHint: "kompanzasyon panosu",
  city: "istanbul",
  cityName: "İstanbul",
  country: null,
  verifiedOnly: false,
  activity: null,
  priceMax: null,
  currency: null,
  quantity: null,
  unit: null,
  keywords: [],
  relaxed: [],
  relaxedCategoryName: null,
  draft: { draft: { title: "x" } as never, flags: [], missingRequired: [], route: "text", downgraded: false, warned: false },
  downgraded: false,
  warned: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "q=kompanzasyon+panosu&kategori=39121500&sehir=istanbul&nitelik=a:b&sayfa=2";
  sessionStorage.clear();
});

describe("AiIntentBand", () => {
  it("özet + URL'deki çipler; çip kaldırınca URL'den düşer (kategoriyle nitelik ve sayfa da)", async () => {
    const user = userEvent.setup();
    render(<AiIntentBand intent={intent} onDismiss={() => {}} />);
    // Başlık bantta (katalogdan), özet API'den öneksiz.
    expect(screen.getByRole("status", { name: "AI arama yorumu" })).toHaveTextContent("AI şöyle anladı: kompanzasyon panosu, İstanbul");
    expect(screen.getByRole("button", { name: /Kategori: Kompanzasyon panoları/ })).toBeInTheDocument();
    // Şehir çipi sunucunun verdiği adı basar (URL değeri kalıcı adres).
    expect(screen.getByRole("button", { name: /Şehir: İstanbul/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Kategori: Kompanzasyon panoları/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?q=kompanzasyon+panosu&sehir=istanbul", { scroll: false });
  });

  it("'Bu tanımla talep aç' taslağı sessionStorage'a yazar ve sihirbaza gider; kapat çağrılır", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<AiIntentBand intent={intent} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Bu tanımla talep aç" }));
    expect(JSON.parse(sessionStorage.getItem("ai-tender-draft") ?? "null")).toMatchObject({ route: "text" });
    expect(h.push).toHaveBeenCalledWith("/company/satinalma/taleplerim/yeni?ai=1");
    await user.click(screen.getByRole("button", { name: "AI yorumunu kapat" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("gevşetme notu: kaldırılan süzgeçler adıyla söylenir", () => {
    h.search = "q=pano";
    render(<AiIntentBand intent={{ ...intent, category: null, city: null, relaxed: ["category", "city"], relaxedCategoryName: "Kompanzasyon panoları" }} onDismiss={() => {}} />);
    expect(screen.getByText("Sonuç vermediği için kaldırıldı: kategori (Kompanzasyon panoları), şehir.")).toBeInTheDocument();
    // Kaldırılan kategori için ayrıca "bulunamadı" uyarısı basılmaz.
    expect(screen.queryByText(/Katalogda uygun kategori bulunamadı/)).toBeNull();
    // Arama kısaltıldıysa kalan terim söylenir.
    render(<AiIntentBand intent={{ ...intent, query: "pano", category: null, relaxed: ["query"], relaxedCategoryName: null }} onDismiss={() => {}} />);
    expect(screen.getByText('Sonuç vermediği için kaldırıldı: arama kısaltıldı ("pano" kaldı).')).toBeInTheDocument();
  });

  it("satışta talep aç düğmesi YOK; kategori eşleşmediyse genel not — Türkçe ipucu metni HAM basılmaz", () => {
    h.search = "q=salt";
    render(<AiIntentBand intent={{ ...intent, portal: "satis", draft: null, category: null, categoryHint: "şalt malzemesi" }} onDismiss={() => {}} />);
    expect(screen.queryByRole("button", { name: "Bu tanımla talep aç" })).toBeNull();
    expect(screen.getByText(/Katalogda uygun kategori bulunamadı/)).toBeInTheDocument();
    expect(screen.queryByText(/şalt malzemesi/)).toBeNull();
  });

  it("ülke süzgeci çip olarak görünür ve kaldırılabilir; gevşetilen ülke notta", async () => {
    const user = userEvent.setup();
    h.search = "q=pano&ulke=DE";
    render(<AiIntentBand intent={{ ...intent, category: null, city: null, cityName: null, country: "DE" }} onDismiss={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Ülke:/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?q=pano", { scroll: false });
    render(<AiIntentBand intent={{ ...intent, category: null, city: null, cityName: null, relaxed: ["city", "country"] }} onDismiss={() => {}} />);
    expect(screen.getByText("Sonuç vermediği için kaldırıldı: şehir, ülke.")).toBeInTheDocument();
  });
});

/**
 * KAYDIRMA KORUMASI (mobil denetim 2026-10, dördüncü tur): çip kaldırmak
 * `router.replace(…, { scroll: false })`; Next 15.5.25 takma adlı ön-getirme
 * yolunda bunu yok sayıp işleme anında sayfayı en başa atıyor (süzgeç
 * kabuğuyla aynı açık). Bant süzgeç kabuğunun kancasını (`useScrollKeep`)
 * kullanır: konum tık anında yakalanır, hedef işlenince geri konur.
 */
describe("AiIntentBand — çip kaldırınca sayfa konumu korunur", () => {
  let y = 0;
  const yDesc = Object.getOwnPropertyDescriptor(window, "scrollY");
  const xDesc = Object.getOwnPropertyDescriptor(window, "scrollX");
  const realRaf = window.requestAnimationFrame;
  /** Next'in sayfa kesimi kaydırıcısı: işleme anında, çocukların yerleşim efektlerinden SONRA başa atar. */
  const nextScroll = { jump: false };
  function NextScrollHandler({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      if (nextScroll.jump) y = 0;
    });
    return <>{children}</>;
  }
  const band = () => (
    <NextScrollHandler>
      <AiIntentBand intent={intent} onDismiss={() => {}} />
    </NextScrollHandler>
  );
  /** Next hedefi işledi: geçmiş kaydı yeniden yazılır, sorgu güncellenir, (isteğe bağlı) sayfa başa atılır. */
  async function commit(view: ReturnType<typeof render>, url: string, jump: boolean) {
    window.history.replaceState({ __NA: true, url }, "", url);
    h.search = url.split("?")[1] ?? "";
    nextScroll.jump = jump;
    await act(async () => view.rerender(band()));
    nextScroll.jump = false;
  }

  beforeEach(() => {
    y = 640;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof window.requestAnimationFrame;
    window.history.replaceState({ __NA: true, url: "start" }, "", `/company/satinalma?${h.search}`);
  });
  afterEach(() => {
    if (yDesc) Object.defineProperty(window, "scrollY", yDesc);
    else delete (window as unknown as { scrollY?: unknown }).scrollY;
    if (xDesc) Object.defineProperty(window, "scrollX", xDesc);
    else delete (window as unknown as { scrollX?: unknown }).scrollX;
    window.requestAnimationFrame = realRaf;
    window.history.replaceState(null, "", "/");
  });

  it("Next işleme anında sayfayı başa atsa da konum hedef işlenince geri konur", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(((a: number | ScrollToOptions, b?: number) => {
      y = typeof a === "number" ? (b ?? 0) : (a.top ?? y);
    }) as typeof window.scrollTo);
    const user = userEvent.setup();
    const view = render(band());
    await user.click(screen.getByRole("button", { name: /Kategori: Kompanzasyon panoları/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?q=kompanzasyon+panosu&sehir=istanbul", { scroll: false });
    await commit(view, "/company/satinalma?q=kompanzasyon+panosu&sehir=istanbul", true);
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
    expect(y).toBe(640);
    // Kaldırılan çip gitti (liste yeni adresi okuyor).
    expect(screen.queryByRole("button", { name: /Kategori:/ })).toBeNull();
  });

  it("Next başa atmadıysa (konum yerinde) kaydırma yazılmaz; hedef işlenmeden önceki çizim dokunmaz", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const user = userEvent.setup();
    const view = render(band());
    await user.click(screen.getByRole("button", { name: /Şehir: İstanbul/ }));
    // Adres henüz eski: yeniden çizim konuma dokunmaz.
    await act(async () => view.rerender(band()));
    expect(scrollTo).not.toHaveBeenCalled();
    await commit(view, "/company/satinalma?q=kompanzasyon+panosu&kategori=39121500&nitelik=a%3Ab", false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
