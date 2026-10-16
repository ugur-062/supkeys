// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Arayüz testi (2026-10-01) — AI Asistan düğmesi:
 *  · Y-01: mobil yapışkan alt çubuk (Teklif Gönder / Yayınla) varken düğme
 *    çubuğun ÜSTÜNE kalkar, birincil düğmeyi örtmez.
 *  · D-099/O-054: karşılama balonu dar ekranda ve form/yazışma sayfalarında
 *    kendiliğinden açılmaz; metni role ve pakete göre seçilir.
 *  · D-359: açık bir modal diyalog varken Escape asistan panelini kapatmaz.
 */
const h = vi.hoisted(() => ({
  path: "/company/satis",
  tier: "GOLD" as string,
  user: {
    firstName: "Ayşe",
    roles: ["SATISCI"],
    permissions: ["sell:view", "sell:bid:submit"],
  } as Record<string, unknown>,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { tier: h.tier }, user: h.user }),
}));
// Panel içeriği bu testin konusu değil (dinamik import yerine sabit gövde).
vi.mock("next/dynamic", () => ({
  default: () =>
    function PanelStub() {
      return <div data-testid="assistant-panel" />;
    },
}));

import { AssistantLauncher } from "../assistant-launcher";

const SELLER = { firstName: "Ayşe", roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] };
const BUYER = { firstName: "Ayşe", roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage"] };

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
}
/** Görünüm yüksekliği (jsdom varsayılanı 768; yüzey payı görünen kısma göre ölçülür). */
function setHeight(h: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
}
/** Sayfanın kaydırma konumu (jsdom kaydırmaz; olay ayrıca gönderilir). */
function setScroll(y: number, x = 0) {
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: y });
  Object.defineProperty(window, "scrollX", { configurable: true, writable: true, value: x });
}

beforeEach(() => {
  sessionStorage.clear();
  h.path = "/company/satis";
  h.tier = "GOLD";
  h.user = SELLER;
  setWidth(1440);
});
const realMatchMedia = window.matchMedia;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setHeight(768);
  setScroll(0);
  document.body.innerHTML = "";
  window.matchMedia = realMatchMedia;
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
});

describe("AssistantLauncher — karşılama balonu", () => {
  it("Satışçıya satın alma talebi vaadi yok, satış yetenekleri yazar", () => {
    vi.useFakeTimers();
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText(/Açık alım taleplerini arayabilir/)).toBeInTheDocument();
    expect(screen.queryByText(/Satın alma talebi açabilir/)).toBeNull();
  });

  it("GOLD firmanın satın almacısına satın alma talebi metni", () => {
    vi.useFakeTimers();
    h.user = BUYER;
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText(/Satın alma talebi açabilir/)).toBeInTheDocument();
  });

  it("SILVER firmanın satın almacısına satın alma talebi vaadi yok", () => {
    vi.useFakeTimers();
    h.user = BUYER;
    h.tier = "SILVER";
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByText(/Satın alma talebi açabilir/)).toBeNull();
    expect(screen.getByText(/Siparişlerinizi ve bağlantılarınızı/)).toBeInTheDocument();
  });

  it.each([
    "/company/mesajlar",
    "/company/satinalma/taleplerim/yeni",
    "/company/ilan/x/teklif-ver",
    // Arayüz testi son tur S-SELL: yanıt kutusunu ve HEDEF FİYAT sütununu örtüyordu.
    "/company/satis/bilgi-talepleri",
    "/company/satinalma/bilgi-taleplerim",
    "/company/ilan/x",
  ])(
    "%s sayfasında kendiliğinden açılmaz ve görüldü işareti yazılmaz",
    (path) => {
      vi.useFakeTimers();
      h.path = path;
      render(<AssistantLauncher />);
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(screen.queryByText("Rothern Asistanı")).toBeNull();
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    },
  );

  it("dar ekranda kendiliğinden açılmaz", () => {
    vi.useFakeTimers();
    setWidth(390);
    // Balonun sayfa izleyicisi (öznitelikleri de gözleyen) telefonda hiç kurulmaz.
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    expect(observe.mock.calls.some(([, opts]) => !!opts?.attributes)).toBe(false);
  });

  it("açık balon sayfa değişse de 6 sn sonra kendiliğinden kapanır", () => {
    vi.useFakeTimers();
    const { rerender } = render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    // Kabuk sayfalar arasında yeniden mount edilmez: yalnız yol değişir.
    h.path = "/company/satis/tekliflerim";
    rerender(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(6_100);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
  });

  it("uygun olmayan sayfada açılmayan balon uygun sayfaya geçince gösterilir", () => {
    vi.useFakeTimers();
    setWidth(390);
    const { rerender } = render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    // Pencere genişledi, sonra kullanıcı başka bir (sessiz olmayan) sayfaya geçti.
    setWidth(1440);
    h.path = "/company/satis/tekliflerim";
    rerender(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    // "Görüldü" balon 2 sn kesintisiz görününce yazılır.
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
  });
});

describe("AssistantLauncher — yapışkan alt çubuk (Y-01)", () => {
  it("görünür alt çubuk varken düğme çubuğun üstüne kalkar", () => {
    setWidth(390);
    const bar = document.createElement("div");
    bar.className = "fixed inset-x-0 bottom-0 z-20";
    bar.getBoundingClientRect = () =>
      ({ top: window.innerHeight - 72, bottom: window.innerHeight, width: 390, height: 72 }) as DOMRect;
    document.body.appendChild(bar);
    render(<AssistantLauncher />);
    const fabEl = screen.getByRole("button", { name: "AI Asistan" });
    expect(fabEl.style.bottom).toBe("88px");
    // Çubuğun ölçüsü güvenli alanın alt payını zaten içerir → ikinci kez eklenmez.
    expect(fabEl).not.toHaveClass("mb-(--safe-bottom)");
    expect(fabEl).toHaveClass("mr-(--safe-right)");
  });

  it("margin-bottom ile yukarı itilmiş alt çubuk da algılanır (webC-01)", () => {
    setWidth(390);
    const bar = document.createElement("div");
    bar.className = "fixed inset-x-0 bottom-0 z-20";
    bar.style.marginBottom = "20px";
    bar.getBoundingClientRect = () =>
      ({ top: window.innerHeight - 89, bottom: window.innerHeight - 20, width: 390, height: 69 }) as DOMRect;
    document.body.appendChild(bar);
    render(<AssistantLauncher />);
    expect(screen.getByRole("button", { name: "AI Asistan" }).style.bottom).toBe("105px");
  });

  it("ekran altına yapışmayan öğe çubuk sayılmaz", () => {
    setWidth(390);
    const bar = document.createElement("div");
    bar.className = "fixed inset-x-0 bottom-0 z-20";
    bar.getBoundingClientRect = () =>
      ({ top: window.innerHeight - 200, bottom: window.innerHeight - 120, width: 390, height: 80 }) as DOMRect;
    document.body.appendChild(bar);
    render(<AssistantLauncher />);
    expect(screen.getByRole("button", { name: "AI Asistan" }).style.bottom).toBe("");
  });

  it("çubuk yoksa (ya da lg:hidden ile 0 boyutluysa) varsayılan konum", () => {
    const bar = document.createElement("div");
    bar.className = "fixed inset-x-0 bottom-0 lg:hidden";
    document.body.appendChild(bar); // jsdom: 0 boyut
    render(<AssistantLauncher />);
    expect(screen.getByRole("button", { name: "AI Asistan" }).style.bottom).toBe("");
  });
});

describe("AssistantLauncher — Escape (D-359)", () => {
  it("açık modal diyalog varken Escape paneli kapatmaz; diyalog yokken kapatır", () => {
    render(<AssistantLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "AI Asistan" }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    dialog.remove();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

/**
 * Mobil denetim 2026-10 (g04/g05/g06/g08/g09) — telefonda düğme küçük ve
 * köşede; modal açıkken, telefonda yazarken ve durduğu yerde bir kontrolün
 * üstündeyken çekilir (`fab-suppression.ts`).
 */
const fab = () => screen.getByRole("button", { name: "AI Asistan" });
const rect = (left: number, top: number, w: number, h: number) =>
  ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top }) as DOMRect;
/** Ölçümü yeniden tetikler (pencere boyutu değişimi yolu). */
const remeasure = () => act(() => void window.dispatchEvent(new Event("resize")));
function setCoarse(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("AssistantLauncher — telefon boyu (mobil denetim 2026-10)", () => {
  it("telefonda 44 px ve köşeye 12 px; sm ve üstünde eski boy ve konum", () => {
    render(<AssistantLauncher />);
    expect(fab()).toHaveClass("max-sm:size-11", "max-sm:right-3", "bottom-8", "right-8", "h-14", "w-14");
    expect(fab()).toHaveClass("max-sm:bottom-3");
  });

  it("güvenli alan: alt çubuk yokken ana ekran çizgisi ve yatay çentik payı kadar içeride (mb/mr)", () => {
    render(<AssistantLauncher />);
    expect(fab()).toHaveClass("mb-(--safe-bottom)", "mr-(--safe-right)");
  });

  it("nefes halkası telefonda çizilmez (köşe payı halka yayılımından küçük → yatay taşma)", () => {
    render(<AssistantLauncher />);
    expect(fab().querySelector(".animate-ping")).toHaveClass("max-sm:hidden");
  });
});

describe("AssistantLauncher — modal açıkken gizli (g05/g08 fab-over-sheet)", () => {
  it("alt çekmece açılınca düğme gizlenir ve üst çubuğa ZIPLAMAZ; kapanınca döner", async () => {
    setWidth(390);
    render(<AssistantLauncher />);
    expect(fab()).not.toHaveClass("invisible");

    // Sheet: Headless Dialog kökü + `fixed inset-x-0 bottom-0` paneli (ekranın
    // neredeyse tamamı — eskiden "alt çubuk" sanılıyordu).
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const panel = document.createElement("div");
    panel.className = "fixed inset-x-0 bottom-0 max-h-[88vh]";
    panel.getBoundingClientRect = () => rect(0, 36, 390, window.innerHeight - 36);
    dialog.appendChild(panel);
    act(() => void document.body.appendChild(dialog));

    await waitFor(() => expect(fab()).toHaveClass("invisible", "opacity-0", "pointer-events-none"));
    expect(fab().style.bottom).toBe("");

    act(() => dialog.remove());
    await waitFor(() => expect(fab()).not.toHaveClass("invisible"));
  });

  it("diyalog dışında da ekranın yarısına yaklaşan alt panel çubuk sayılmaz", () => {
    setWidth(390);
    const panel = document.createElement("div");
    panel.className = "fixed inset-x-0 bottom-0";
    panel.getBoundingClientRect = () => rect(0, 100, 390, window.innerHeight - 100);
    document.body.appendChild(panel);
    render(<AssistantLauncher />);
    expect(fab().style.bottom).toBe("");
  });

  it("masaüstünde de modal açıkken gizli (perdenin altında zaten tıklanamaz)", async () => {
    render(<AssistantLauncher />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    act(() => void document.body.appendChild(dialog));
    await waitFor(() => expect(fab()).toHaveClass("invisible"));
  });
});

describe("AssistantLauncher — yazarken gizli (g05 hero araması)", () => {
  it("telefonda metin alanı odaktayken gizlenir, odak gidince döner", async () => {
    setWidth(390);
    render(<AssistantLauncher />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => input.focus());
    await waitFor(() => expect(fab()).toHaveClass("invisible"));
    act(() => input.blur());
    await waitFor(() => expect(fab()).not.toHaveClass("invisible"));
  });

  it("dokunmatik cihazda geniş ekranda da gizlenir", async () => {
    setCoarse(true);
    render(<AssistantLauncher />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    act(() => textarea.focus());
    await waitFor(() => expect(fab()).toHaveClass("invisible"));
  });

  it("masaüstünde (ince işaretçi, geniş ekran) odak düğmeyi gizlemez", async () => {
    render(<AssistantLauncher />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => input.focus());
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveClass("invisible");
  });

  it("klavye açmayan odak (onay kutusu) gizlemez", async () => {
    setWidth(390);
    render(<AssistantLauncher />);
    const box = document.createElement("input");
    box.type = "checkbox";
    document.body.appendChild(box);
    act(() => box.focus());
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveClass("invisible");
  });
});

describe("AssistantLauncher — kontrolün üstündeyse çekilir (g04/g06/g08/g09)", () => {
  /** Düğmenin altındaki öğeyi `elementsFromPoint` sahtesiyle verir. */
  function setup(under: () => Element) {
    setWidth(390);
    setHeight(844);
    render(<AssistantLauncher />);
    const button = fab();
    // 390×844'te köşedeki 44 px düğme.
    button.getBoundingClientRect = () => rect(334, 788, 44, 44);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      button,
      under(),
      document.body,
      document.documentElement,
    ]);
    return button;
  }

  it("Ürünlerim satırının ⋮ düğmesinin üstündeyse gizlenir; köşe boşalınca döner", async () => {
    const kebab = document.createElement("button");
    kebab.getBoundingClientRect = () => rect(318, 787, 44, 44);
    const text = document.createElement("p");
    document.body.append(kebab, text);
    let under: Element = kebab;
    setup(() => under);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));

    under = text;
    remeasure();
    await waitFor(() => expect(fab()).not.toHaveAttribute("data-suppressed"));
  });

  it("simgenin altındaki öğe de kontrolün içindeyse sayılır (svg → button)", async () => {
    const send = document.createElement("button");
    send.getBoundingClientRect = () => rect(300, 760, 48, 36);
    const icon = document.createElement("span");
    send.appendChild(icon);
    document.body.appendChild(send);
    setup(() => icon);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("büyük etkileşimli öğe (kart bağlantısı) örtüşme sayılmaz", async () => {
    const card = document.createElement("a");
    card.href = "/urun";
    card.getBoundingClientRect = () => rect(16, 500, 358, 340);
    document.body.appendChild(card);
    setup(() => card);
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");
  });

  it("geniş düğmenin yalnız ucu örtülse de sayılır ('Excel ile İçe Aktar', g06)", async () => {
    // Catalyst outline düğmesi: çerçeveli, 230×44 (kısa → düğme, yüzey değil).
    const excel = document.createElement("button");
    excel.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    excel.getBoundingClientRect = () => rect(132, 790, 230, 44);
    document.body.appendChild(excel);
    setup(() => excel);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("uzun başlık bağlantısının sonu örtüşme sayılmaz; kısa eylem bağlantısı sayılır", async () => {
    const title = document.createElement("a");
    title.href = "/urun/1";
    title.getBoundingClientRect = () => rect(16, 790, 340, 19);
    const cta = document.createElement("a");
    cta.href = "/siparis/1";
    cta.getBoundingClientRect = () => rect(270, 800, 106, 24);
    document.body.append(title, cta);
    let under: Element = title;
    setup(() => under);
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    under = cta;
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("masaüstünde de ölçülür: Taleplerim 'Sonraki sayfa'nın üstündeyse çekilir (doğrulama g06)", async () => {
    // 1280×800, sayfa sonu: küçük düğme (1212–1256 × 732–776) '›' düğmesinin
    // (1200–1240 × 738–766) %70'ini örtüyor, tıklama asistanı açıyordu.
    const next = document.createElement("button");
    next.setAttribute("aria-label", "Sonraki sayfa");
    next.getBoundingClientRect = () => rect(1200, 738, 40, 28);
    document.body.appendChild(next);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(1212, 732, 44, 44);
    const probe = vi.fn(() => [button, next, document.body]);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = probe;
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
    expect(probe).toHaveBeenCalled();
    // Tıklama geçer, klavyeyle hâlâ ulaşılır (`invisible` yok).
    expect(fab()).toHaveClass("pointer-events-none", "opacity-0");
    expect(fab()).not.toHaveClass("invisible");
  });

  it("imleç düğmenin üstündeyken çekilmez (2 px'lik hover kayması düğmeyi imlecin altından çekmesin)", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(hover: hover)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const next = document.createElement("button");
    next.getBoundingClientRect = () => rect(1200, 738, 40, 28);
    document.body.appendChild(next);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(1212, 732, 44, 44);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [button, next, document.body]);
    let hover = true;
    const realMatches = button.matches.bind(button);
    vi.spyOn(button, "matches").mockImplementation((sel: string) => (sel === ":hover" ? hover : realMatches(sel)));
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // İmleç çıktı (hover geçişi biter) → yeniden ölçülür, çekilir.
    hover = false;
    act(() => void fireEvent.transitionEnd(button));
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("masaüstünde tam boy düğme 'Varsayılan yap'ın ucundaysa da çekilir (doğrulama g06 /yeni)", async () => {
    const def = document.createElement("button");
    def.getBoundingClientRect = () => rect(1115, 697, 105, 29);
    document.body.appendChild(def);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(1192, 710, 56, 56);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [button, def, document.body]);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("kaydırma sürerken karar değişmez, kaydırma durunca yeniden ölçülür", async () => {
    const kebab = document.createElement("button");
    kebab.getBoundingClientRect = () => rect(318, 787, 44, 44);
    const text = document.createElement("p");
    document.body.append(kebab, text);
    let under: Element = text;
    setup(() => under);
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // Kaydırma başladı: altına ⋮ geldi ama karar kaydırma bitene dek aynı.
    under = kebab;
    act(() => void document.dispatchEvent(new Event("scroll")));
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // Kaydırma durdu → yeniden ölçülür.
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  /**
   * Mobil denetim 2026-10, üçüncü tur: telefon gelen kutusunda her konuşma
   * satırı 358×78 tam genişlik bir <button>; düğme 20 durağan konumun 18'inde
   * çekiliyor, asistana yalnız listenin sonunda ulaşılıyordu.
   */
  it("gelen kutusu: tam genişlik satır düğmesinin köşesi örtülse de düğme görünür kalır; satırın yanındaki küçük düğme sayılır", async () => {
    const row = document.createElement("button");
    row.getBoundingClientRect = () => rect(16, 786, 358, 78);
    const more = document.createElement("button");
    more.getBoundingClientRect = () => rect(300, 790, 74, 32);
    document.body.append(row, more);
    let under: Element = row;
    setup(() => under);
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    under = more;
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("tam genişlik zeminli birincil düğme (328×44) kısa olduğu için düğmedir: ucu örtülse de çekilir", async () => {
    const cta = document.createElement("button");
    cta.style.backgroundColor = "rgb(30, 137, 223)";
    cta.getBoundingClientRect = () => rect(31, 790, 328, 44);
    document.body.appendChild(cta);
    setup(() => cta);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  /**
   * Handoff (2026-10, 1024–1600 masaüstü): satınalma anasayfasında öneri
   * kartının başlık bağlantısı `after:absolute after:inset-0` ile kartın
   * tamamını kaplıyor; kural yalnız bağlantının kendi kutusunu (111×36)
   * ölçüyor, düğme ilk yüklemede çekiliyor ve karşılama balonu hiç çıkmıyordu.
   */
  it("masaüstü: `::after` ile karta yayılan başlık bağlantısı KART olarak ölçülür (çekilmez); yayılmayan küçük bağlantı sayılır", async () => {
    setWidth(1366);
    setHeight(768);
    const card = document.createElement("div");
    card.style.position = "relative";
    card.getBoundingClientRect = () => rect(1150, 520, 200, 321);
    // Düğme başlığın sonunun ve kartın görseli/satıcı alanının üstünde.
    const title = document.createElement("a");
    title.href = "/company/satinalma/urunler/f/u";
    title.className = "after:absolute after:inset-0";
    title.getBoundingClientRect = () => rect(1240, 690, 100, 36);
    card.appendChild(title);
    document.body.appendChild(card);
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, which?: string | null) => {
      if (which === "::after" && el === title && title.className.includes("after:")) {
        return { position: "absolute", content: '""', display: "block", pointerEvents: "auto", visibility: "visible", top: "0px", right: "0px", bottom: "0px", left: "0px" } as unknown as CSSStyleDeclaration;
      }
      if (which) return { position: "static", content: "none" } as unknown as CSSStyleDeclaration;
      return real(el);
    });
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(1278, 680, 56, 56);
    // `::after` kartın tamamını kaplarken her noktada bağlantı vurulur; yayılmayan
    // bağlantı yalnız kendi kutusunda.
    const inTitle = (x: number, y: number) => x >= 1240 && x <= 1340 && y >= 690 && y <= 726;
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn((x: number, y: number) =>
      title.className.includes("after:") || inTitle(x, y) ? [button, title, card, document.body] : [button, card, document.body],
    );
    remeasure();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // Aynı bağlantı karta yayılmasaydı (kendi kutusu 111×36) küçük kontrol olurdu.
    title.className = "";
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });
});

/**
 * Doğrulama turu 2026-10 (g08): düğme görünümlü bağlantılar ("Teklif ver",
 * "Mesaj Gönder") uzun başlık bağlantısı sayılıp ucu örtüldüğünde düğme
 * görünür kalıyordu; telefonda düğme ilk yüklemede Kapanış tarihinin sonunu
 * örtüyordu ("16 Eki 202").
 */
describe("AssistantLauncher — düğme görünümlü bağlantı ve metin (doğrulama g08)", () => {
  const realGetClientRects = (Range.prototype as { getClientRects?: unknown }).getClientRects;
  afterEach(() => {
    if (realGetClientRects === undefined) delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
    else (Range.prototype as { getClientRects?: unknown }).getClientRects = realGetClientRects;
  });

  /** 360×780 köşedeki 44 px düğme (304–348 × 724–768). */
  function setupPhone(under: () => Element, width = 360) {
    setWidth(width);
    setHeight(780);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(304, 724, 44, 44);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      button,
      under(),
      document.body,
      document.documentElement,
    ]);
    return button;
  }
  /** `Range.getClientRects` sahtesi (jsdom'da yok): yalnız verilen metin düğümü çizili. */
  function paintText(node: Text, box: DOMRect) {
    (Range.prototype as { getClientRects?: unknown }).getClientRects = function (this: Range) {
      return this.startContainer === node ? [box] : [];
    };
  }
  const settle = () =>
    act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

  it("kart içi 'Teklif ver' CTA'sının (zeminli bağlantı) yalnız ucu örtülse de çekilir", async () => {
    // TR 360: CTA 215–332 × 734–766; örtülen 28 px eninin dörtte birinden az.
    const cta = document.createElement("a");
    cta.href = "/company/ilan/x/teklif-ver";
    cta.style.backgroundColor = "rgb(26, 156, 85)";
    cta.getBoundingClientRect = () => rect(215, 734, 117, 32);
    document.body.appendChild(cta);
    setupPhone(() => cta);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("çerçeveli 'Mesaj Gönder' bağlantısının köşesi örtülse de çekilir", async () => {
    const msg = document.createElement("a");
    msg.href = "/company/mesajlar?with=c1&portal=satis";
    msg.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    msg.getBoundingClientRect = () => rect(186, 700, 138, 44);
    document.body.appendChild(msg);
    setupPhone(() => msg);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("iki satıra kırılan çerçeveli RU 'Отправить сообщение' (155×68) bağlantısının ucu örtülse de çekilir", async () => {
    // RU 360 sipariş sayfası ilk yükleme: bağlantı 169–324 × 714–782, düğme
    // 304–348 × 724–768; eskiden 52 px üstü "satır" sayılıyor, uca dokunmak
    // asistanı açıyordu.
    const msg = document.createElement("a");
    msg.href = "/ru/kompaniya/soobshcheniya?with=c1&portal=satis";
    msg.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    msg.getBoundingClientRect = () => rect(169, 714, 155, 68);
    document.body.appendChild(msg);
    setupPhone(() => msg);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("zeminli ama satır kadar yüksek liste bağlantısı (satır) istisnada kalır", async () => {
    const row = document.createElement("a");
    row.href = "/company/siparis/1";
    row.style.backgroundColor = "rgb(255, 255, 255)";
    row.getBoundingClientRect = () => rect(16, 700, 328, 72);
    document.body.appendChild(row);
    setupPhone(() => row);
    remeasure();
    await settle();
    expect(fab()).not.toHaveAttribute("data-suppressed");
  });

  it("telefonda ilk yüklemede Kapanış tarihinin üstündeyse çekilir; metin yoksa döner", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("16 Eki 2026 22:12");
    date.appendChild(node);
    const blank = document.createElement("div");
    document.body.append(date, blank);
    // Metin 239–321 × 728–745 (TR 360 ölçümü).
    paintText(node, rect(239, 728, 82, 17));
    let under: Element = date;
    setupPhone(() => under);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));

    under = blank;
    remeasure();
    await waitFor(() => expect(fab()).not.toHaveAttribute("data-suppressed"));
  });

  it("metin düğmenin dairesine değmiyorsa (kutunun köşesinde kalıyorsa) sayılmaz", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("22:12");
    date.appendChild(node);
    document.body.appendChild(date);
    // Metin kutunun sol-üst köşesine giriyor (304–312 × 724–732) ama bu köşe
    // yuvarlak düğmenin dışında: altındaki metin görünür kalır.
    paintText(node, rect(296, 716, 16, 16));
    setupPhone(() => date);
    remeasure();
    await settle();
    expect(fab()).not.toHaveAttribute("data-suppressed");
  });

  /**
   * Mobil denetim 2026-10, dördüncü doğrulama (s1-fab#v4new1): 390 TR
   * satınalma anasayfasının ilk görünümünde kayan şeridin sağ kenarından
   * sonraki kartın başlığının 2 px'i görünüyordu ("Modüler Bant Konveyör",
   * satır 372–454 × 811–827, şerit 374'te kırpıyor); yüzey kuralı kartı şerit
   * saymıştı ama METİN kuralı o 2 px'lik glifi sayıp düğmeyi çekiyordu.
   */
  it("ilk görünüm: şeridin kenarından 2 px görünen kart başlığı metin sayılmaz; 24 px'ten genişi sayılır", async () => {
    const strip = document.createElement("ul");
    strip.style.overflowX = "auto";
    strip.getBoundingClientRect = () => rect(16, 600, 358, 300);
    const title = document.createElement("h3");
    const node = document.createTextNode("Modüler Bant Konveyör (Metre)");
    title.appendChild(node);
    strip.appendChild(title);
    document.body.appendChild(strip);
    paintText(node, rect(372, 811, 82, 16));
    setWidth(390);
    setHeight(844);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(334, 788, 44, 44);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      button,
      title,
      strip,
      document.body,
      document.documentElement,
    ]);
    remeasure();
    await settle();
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // Kart 26 px daha soldaysa (başlığın 28 px'i görünür) ilk görünümde metin sayılır.
    paintText(node, rect(346, 811, 82, 16));
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("masaüstünde metin çekilme nedeni değildir (küçük düğme metnin üstünde yarı saydam)", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("16 Eki 2026");
    date.appendChild(node);
    document.body.appendChild(date);
    render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(1212, 732, 44, 44);
    paintText(node, rect(1150, 740, 100, 17));
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [button, date, document.body]);
    remeasure();
    await settle();
    expect(fab()).not.toHaveAttribute("data-suppressed");
  });

  it("örtüşmede çekilen düğme klavyeyle odaklanınca görünür, odak gidince yine çekilir", async () => {
    const kebab = document.createElement("button");
    kebab.getBoundingClientRect = () => rect(300, 724, 44, 44);
    document.body.appendChild(kebab);
    setupPhone(() => kebab);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
    expect(fab()).not.toHaveClass("invisible");

    act(() => fab().focus());
    await waitFor(() => expect(fab()).not.toHaveAttribute("data-suppressed"));
    act(() => fab().blur());
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("masaüstünde düğme çekilmişken karşılama balonu açılmaz, 'görüldü' yazılmaz; düğme dönünce açılır", () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    const next = document.createElement("button");
    next.getBoundingClientRect = () => rect(1380, 830, 40, 28);
    const blank = document.createElement("div");
    document.body.append(next, blank);
    let under: Element = next;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute("aria-label") === "AI Asistan" ? rect(1384, 812, 56, 56) : rect(0, 0, 0, 0);
      });
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      screen.getByRole("button", { name: "AI Asistan" }),
      under,
      document.body,
    ]);
    try {
      render(<AssistantLauncher />);
      expect(fab()).toHaveAttribute("data-suppressed", "covers");
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(screen.queryByText("Rothern Asistanı")).toBeNull();
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();

      under = blank;
      act(() => {
        window.dispatchEvent(new Event("resize"));
        vi.advanceTimersByTime(20);
      });
      expect(fab()).not.toHaveAttribute("data-suppressed");
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
      // "Görüldü" balon 2 sn kesintisiz görününce yazılır.
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
    } finally {
      rectSpy.mockRestore();
    }
  });

  /** Kullanıcı sayfayı kaydırdı: konum değişir, olay belgede, kaydırma durur. */
  const userScrolls = async (y: number) => {
    setScroll(y);
    act(() => void document.dispatchEvent(new Event("scroll")));
    // Kaydırma durunca (160 ms) yeniden ölçülür.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    await settle();
  };

  it("METİN kuralı yalnız ilk görünümde: sayfa kaydırılınca metnin üstünde durmak çekilme nedeni değil (mobil denetim 2026-10)", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("16 Eki 2026 22:12");
    date.appendChild(node);
    document.body.appendChild(date);
    paintText(node, rect(239, 728, 82, 17));
    setupPhone(() => date);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));

    await userScrolls(120);
    expect(fab()).not.toHaveAttribute("data-suppressed");
    // Yeniden ölçümler (boyut, DOM) kararı geri getirmez.
    remeasure();
    await settle();
    expect(fab()).not.toHaveAttribute("data-suppressed");
  });

  it("ilk kaydırmadan sonra da KONTROLÜN üstündeyse çekilir (örtüşme kuralı her zaman)", async () => {
    const kebab = document.createElement("button");
    kebab.getBoundingClientRect = () => rect(300, 724, 44, 44);
    const text = document.createElement("p");
    const node = document.createTextNode("6.000,00 ₺");
    text.appendChild(node);
    document.body.append(kebab, text);
    paintText(node, rect(280, 738, 60, 17));
    let under: Element = text;
    setupPhone(() => under);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));

    await userScrolls(300);
    expect(fab()).not.toHaveAttribute("data-suppressed");

    under = kebab;
    act(() => void document.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("iç kaydırma kabı ve konumu değiştirmeyen olay ilk kaydırma sayılmaz", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("16 Eki 2026");
    date.appendChild(node);
    const strip = document.createElement("div");
    document.body.append(date, strip);
    paintText(node, rect(239, 728, 82, 17));
    setupPhone(() => date);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));

    // Yatay şerit kaydı (iç kap) — sayfa yerinde.
    act(() => void strip.dispatchEvent(new Event("scroll")));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    await settle();
    expect(fab()).toHaveAttribute("data-suppressed", "covers");

    // Belgeye düşen ama konumu değiştirmeyen olay.
    act(() => void document.dispatchEvent(new Event("scroll")));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    await settle();
    expect(fab()).toHaveAttribute("data-suppressed", "covers");
  });

  it("rota değişince 'kaydırıldı' sıfırlanır; yeni sayfanın başa dönmesi (0, 0) kaydırma sayılmaz", async () => {
    const date = document.createElement("p");
    const node = document.createTextNode("16 Eki 2026 22:12");
    date.appendChild(node);
    document.body.appendChild(date);
    paintText(node, rect(239, 728, 82, 17));
    setWidth(360);
    const view = render(<AssistantLauncher />);
    const button = fab();
    button.getBoundingClientRect = () => rect(304, 724, 44, 44);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      button,
      date,
      document.body,
      document.documentElement,
    ]);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
    await userScrolls(800);
    expect(fab()).not.toHaveAttribute("data-suppressed");

    // Yeni sayfa: kabuk yeniden bağlanmaz, yalnız yol değişir. Next görünümü
    // rota değişiminden SONRA başa alır — o olay kullanıcı kaydırması değil.
    h.path = "/company/satis/tekliflerim";
    view.rerender(<AssistantLauncher />);
    await userScrolls(0);
    remeasure();
    await waitFor(() => expect(fab()).toHaveAttribute("data-suppressed", "covers"));
  });

  it("düğme 30 sn boyunca çekili kalırsa balon o sayfada vazgeçer, sonraki sayfada yeniden dener", () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    const arrow = document.createElement("button");
    const blank = document.createElement("div");
    document.body.append(arrow, blank);
    let under: Element = arrow;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute("aria-label") === "AI Asistan") return rect(1192, 712, 56, 56);
        return this === arrow ? rect(1188, 712, 40, 40) : rect(0, 0, 0, 0);
      });
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [
      screen.getByRole("button", { name: "AI Asistan" }),
      under,
      document.body,
    ]);
    try {
      const { rerender } = render(<AssistantLauncher />);
      expect(fab()).toHaveAttribute("data-suppressed", "covers");
      act(() => {
        vi.advanceTimersByTime(800 + 31 * 1_000);
      });
      expect(screen.queryByText("Rothern Asistanı")).toBeNull();
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();

      // Düğme geri geldi ama bu sayfadaki bekleme bitti: balon kendiliğinden açılmaz.
      under = blank;
      act(() => {
        window.dispatchEvent(new Event("resize"));
        vi.advanceTimersByTime(2_000);
      });
      expect(fab()).not.toHaveAttribute("data-suppressed");
      expect(screen.queryByText("Rothern Asistanı")).toBeNull();

      // Başka sayfaya geçince yeniden denenir.
      h.path = "/company/satis/tekliflerim";
      rerender(<AssistantLauncher />);
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
      // "Görüldü" balon 2 sn kesintisiz görününce yazılır.
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
    } finally {
      rectSpy.mockRestore();
    }
  });
});

/**
 * Mobil denetim 2026-10, üçüncü tur: düğme 1280'de görünür olunca karşılama
 * balonu (1000–1260 × 569–704) satınalma anasayfasının "Tümünü gör"
 * bağlantısını (1135–1240 × 608–628) 6 sn örtüyor, tıklama asistanı
 * açıyordu. Balon önce görünmez çizilir, altında kontrol varsa açılmaz.
 */
describe("AssistantLauncher — karşılama balonu kontrolü örtmez", () => {
  function scene() {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    setWidth(1280);
    setHeight(800);
    const link = document.createElement("a");
    link.href = "/company/satinalma/urunler";
    // Öneri kartı: başlık bağlantısı karta yayılmış (176×321) — YÜZEY.
    const card = document.createElement("a");
    card.href = "/company/urun/firma/urun";
    // Sayfa sonundaki karusel oku: AI düğmesinin altına gelince düğme çekilir.
    const arrow = document.createElement("button");
    const blank = document.createElement("div");
    document.body.append(link, card, arrow, blank);
    const state = {
      linkUnderBubble: true,
      cardUnderBubble: false,
      card: rect(1050, 400, 176, 321),
      arrowUnderFab: false,
      /** Sahnedeki diğer öğelerin kutuları (iskelet, sonradan gelen içerik). */
      rects: new Map<Element, DOMRect>(),
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const known = state.rects.get(this);
      if (known) return known;
      if (this.getAttribute("aria-label") === "AI Asistan") return rect(1192, 712, 56, 56);
      if (this.classList.contains("bottom-24")) return rect(1000, 569, 260, 135);
      if (this === link) return rect(1135, 608, 105, 20);
      if (this === card) return state.card;
      if (this === arrow) return rect(1196, 716, 40, 40);
      return rect(0, 0, 0, 0);
    });
    const inLink = (x: number, y: number) => x >= 1135 && x <= 1240 && y >= 608 && y <= 628;
    const inCard = (x: number, y: number) =>
      x >= state.card.left && x <= state.card.right && y >= state.card.top && y <= state.card.bottom;
    const inFab = (x: number, y: number) => x >= 1192 && x <= 1248 && y >= 712 && y <= 768;
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn((x: number, y: number) => [
      state.arrowUnderFab && inFab(x, y)
        ? arrow
        : state.linkUnderBubble && inLink(x, y)
          ? link
          : state.cardUnderBubble && inCard(x, y)
            ? card
            : blank,
      document.body,
    ]);
    return state;
  }
  /** Kaydırma (belgede) ve kaydırmanın durması (160 ms) + düğmenin yeniden ölçümü (bir kare). */
  const scrollSettles = () =>
    act(() => {
      document.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(200);
    });

  it("balonun yeri bir bağlantının üstündeyse açılmaz ve 'görüldü' yazılmaz; yer boşalınca açılır", () => {
    const state = scene();
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    // Düğme görünür (altında kontrol yok) ama balon açılmadı.
    expect(fab()).not.toHaveAttribute("data-suppressed");
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();

    // Kullanıcı kaydırdı: balonun yeri boşaldı → sonraki denemede açılır.
    state.linkUnderBubble = false;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    // "Görüldü" balon 2 sn kesintisiz görününce yazılır.
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
  });

  /**
   * Mobil denetim 2026-10, beşinci tur: yüzey hiç sayılmazken balon 1280×800
   * satınalma anasayfasında bir kategori kutusunun %80'ini, 1920'de kayan
   * şeritteki kartın görünen başlığını örtüyor; örtülen başlığa tıklamak
   * asistanı açıyordu. Kart (yüzey) görünen alanının %25'inden fazlası balonun
   * altında kalacaksa balon açılmaz; yalnız ucu altında kalacaksa açılır.
   */
  it("balonun yeri bir KARTIN görünen alanının %25'inden fazlasını örtecekse açılmaz; kartın yalnız ucunu örtecekse açılır", () => {
    const state = scene();
    state.linkUnderBubble = false;
    state.cardUnderBubble = true;
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    // Kart 176×321, balon 176×135'ini örter (%42).
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();

    // Kullanıcı kaydırdı: kartın yalnız sağ ucu (36 px, %9) balonun yerinde.
    state.card = rect(860, 400, 176, 321);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    // "Görüldü" balon 2 sn kesintisiz görününce yazılır.
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
    // Kart yerinde dururken balonun yerine bir bağlantı gelirse yine kapanır.
    state.linkUnderBubble = true;
    scrollSettles();
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
  });

  /**
   * Mobil denetim 2026-10, beşinci tur (1280×800 Şirketim): balon açıkken
   * kaydırmayla düğme bir kontrolün üstüne geldi ve çekildi (balon onunla
   * kalktı); sayfa sonunda düğme geri gelince balon "Davetli Ekle"
   * bağlantılarının üstünde YENİDEN belirdi. Kaydırma yoklaması 160 ms'de
   * koşmuş, balon o an çizili olmadığı için hiçbir şey ölçmemişti.
   */
  it("düğme çekilip geri gelince balon yeniden yoklanır: yeri bir kontrolün üstündeyse yeniden belirmez", () => {
    const state = scene();
    state.linkUnderBubble = false;
    const { rerender } = render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();

    // Kaydırma: düğmenin altına karusel oku geldi → düğme çekildi, balon kalktı.
    state.arrowUnderFab = true;
    scrollSettles();
    expect(fab()).toHaveAttribute("data-suppressed", "covers");
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();

    // Sayfa sonu: balonun yerinde bir bağlantı var, düğmenin altı boşaldı.
    state.linkUnderBubble = true;
    state.arrowUnderFab = false;
    scrollSettles();
    expect(fab()).not.toHaveAttribute("data-suppressed");
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    // Bu sayfada sonradan da yeniden açılmaz.
    state.linkUnderBubble = false;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    // 2 sn görünmeden kapandı: "görüldü" yazılmadı, sonraki sayfada yeniden denenir
    // (dördüncü doğrulama s1-fab#v4new0).
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    h.path = "/company/satis/tekliflerim";
    rerender(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
  });

  it("düğme çekilip geri gelince balonun yeri boşsa balon yeniden görünür (6 sn dolmadıysa)", () => {
    const state = scene();
    state.linkUnderBubble = false;
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    state.arrowUnderFab = true;
    scrollSettles();
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();

    state.arrowUnderFab = false;
    scrollSettles();
    expect(fab()).not.toHaveAttribute("data-suppressed");
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    // Açılıştan (800 ms) 6 sn sonra kapanır; süre çekilmeyle yeniden başlamaz.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
  });

  it("açık balonun altına kaydırmasız (içerik değişimiyle) bir bağlantı gelirse balon kapanır", async () => {
    const state = scene();
    state.linkUnderBubble = false;
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();

    // Sonradan gelen içerik sayfayı kaydırmadan bağlantıyı balonun altına itti.
    state.linkUnderBubble = true;
    // MutationObserver geri çağrısı mikro görevde: eşzamansız `act` bekler.
    await act(async () => {
      document.body.appendChild(document.createElement("section"));
    });
    // BİR KARE içinde kapanır (eskiden 160 ms'lik bekleyiş her değişiklikte
    // yeniden başlıyor, akan içerik balonu 1 sn'ye dek açık tutuyordu).
    act(() => {
      vi.advanceTimersByTime(17);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    // Erken kapandı: "görüldü" yazılmaz.
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
  });

  it("açık balonun altına kaydırmayla bir bağlantı gelirse balon kapanır", () => {
    const state = scene();
    state.linkUnderBubble = false;
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("Rothern Asistanı")).toBeInTheDocument();

    state.linkUnderBubble = true;
    act(() => {
      document.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
  });

  it("kapatma düğmesinin dokunma alanı 28 px (simge 14 px)", () => {
    vi.useFakeTimers();
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    const close = screen.getByRole("button", { name: "Karşılama mesajını kapat" });
    expect(close).toHaveClass("size-7");
    // Bilinçli kapatma 2 sn beklemez: "görüldü" hemen yazılır.
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    fireEvent.click(close);
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
    expect(sessionStorage.getItem("ai-assistant-greeted")).toBe("1");
  });

  /**
   * Mobil denetim 2026-10, dördüncü doğrulama (s1-fab#v4new0): yer yoklaması
   * sayfa hâlâ yüklenirken koşuyordu — 1440×900 satınalma anasayfasında balon
   * şeridin iskeletinin üstünde açıldı (yerindeki son değişiklik 489 ms
   * önceydi), kartlar ve "İleri kaydır" oku altına geldi, balon 1 sn'ye dek
   * onların üstünde kaldı; oka tıklamak asistanı açtı.
   */
  describe("sayfa balonun yerinde oturmadan yoklanmaz", () => {
    /** MutationObserver geri çağrısı mikro görevde: değişiklik eşzamansız `act` ile. */
    const mutate = (fn: () => void) =>
      act(async () => {
        fn();
      });
    const advance = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    const greeting = () => screen.queryByText("Rothern Asistanı");

    it("yerinde iskelet varken açılmaz; içerik gelince yerine kontrol düşerse hiç açılmaz", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const skeleton = document.createElement("div");
      skeleton.className = "h-64 w-40 animate-pulse rounded-lg bg-zinc-100";
      state.rects.set(skeleton, rect(1060, 644, 176, 256));
      document.body.appendChild(skeleton);
      render(<AssistantLauncher />);
      advance(5_000);
      // Yer "boş" görünüyor (iskelet kontrol değil) ama sayfa hâlâ yükleniyor.
      expect(greeting()).toBeNull();

      // Şerit geldi: kart başlığı ve ok balonun yerinde.
      const rail = document.createElement("ul");
      state.rects.set(rail, rect(296, 644, 1104, 256));
      await mutate(() => {
        skeleton.replaceWith(rail);
        state.linkUnderBubble = true;
      });
      advance(10_000);
      expect(greeting()).toBeNull();
      expect(sessionStorage.getItem("ai-assistant-greeted")).toBeNull();
    });

    it("iskelet gidip balonun yeri 600 ms değişmeden kalınca açılır", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const skeleton = document.createElement("div");
      skeleton.className = "animate-pulse";
      state.rects.set(skeleton, rect(1060, 644, 176, 256));
      document.body.appendChild(skeleton);
      render(<AssistantLauncher />);
      advance(3_000);
      expect(greeting()).toBeNull();

      // İçerik geldi (balonun yerinde kontrol yok).
      const content = document.createElement("section");
      state.rects.set(content, rect(1060, 644, 176, 256));
      await mutate(() => skeleton.replaceWith(content));
      advance(550);
      expect(greeting()).toBeNull();
      advance(100);
      expect(greeting()).toBeInTheDocument();
    });

    it("balonun yerinde değişiklik sürdükçe açılmaz; son değişiklikten 600 ms sonra açılır", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const rail = document.createElement("div");
      state.rects.set(rail, rect(960, 600, 320, 300));
      document.body.appendChild(rail);
      render(<AssistantLauncher />);
      // Akan içerik: 300 ms arayla şeride öğe ekleniyor (0 … 1500 ms).
      for (let i = 0; i < 6; i++) {
        await mutate(() => rail.appendChild(document.createElement("div")));
        advance(300);
      }
      expect(greeting()).toBeNull();
      advance(250);
      expect(greeting()).toBeNull();
      advance(100);
      expect(greeting()).toBeInTheDocument();
    });

    it("başka yerdeki değişiklik (kenar çubuğu rozeti) ve asistanın kendi düğümleri bekletmez", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const sidebar = document.createElement("nav");
      state.rects.set(sidebar, rect(0, 56, 256, 744));
      document.body.appendChild(sidebar);
      render(<AssistantLauncher />);
      for (let i = 0; i < 3; i++) {
        await mutate(() => {
          sidebar.appendChild(document.createElement("span"));
          fab().classList.toggle("opacity-60");
        });
        advance(300);
      }
      expect(greeting()).toBeInTheDocument();
    });

    it("`aria-busy` kap balonun yerindeyken açılmaz; yükleme bitince açılır", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const list = document.createElement("div");
      list.setAttribute("aria-busy", "true");
      state.rects.set(list, rect(296, 400, 984, 400));
      document.body.appendChild(list);
      render(<AssistantLauncher />);
      advance(3_000);
      expect(greeting()).toBeNull();
      await mutate(() => list.removeAttribute("aria-busy"));
      advance(650);
      expect(greeting()).toBeInTheDocument();
    });

    it("veri isteği sürerken açılmaz (boş duran ama dolacak kap); istek bitip sayfa oturunca açılır", async () => {
      scene().linkUnderBubble = false;
      const client = new QueryClient();
      let resolve: (v: unknown) => void = () => {};
      void client.fetchQuery({
        queryKey: ["sayfa-verisi"],
        queryFn: () =>
          new Promise((r) => {
            resolve = r;
          }),
      });
      try {
        render(
          <QueryClientProvider client={client}>
            <AssistantLauncher />
          </QueryClientProvider>,
        );
        advance(5_000);
        expect(greeting()).toBeNull();
        await act(async () => {
          resolve([]);
        });
        advance(650);
        expect(greeting()).toBeInTheDocument();
      } finally {
        client.clear();
      }
    });

    it("sayfa 31 sn oturmazsa o sayfada vazgeçer; sonraki sayfada yeniden dener", async () => {
      const state = scene();
      state.linkUnderBubble = false;
      const skeleton = document.createElement("div");
      skeleton.className = "animate-pulse";
      state.rects.set(skeleton, rect(1060, 644, 176, 256));
      document.body.appendChild(skeleton);
      const { rerender } = render(<AssistantLauncher />);
      advance(31_500);
      await mutate(() => skeleton.remove());
      advance(5_000);
      expect(greeting()).toBeNull();
      h.path = "/company/satis/tekliflerim";
      rerender(<AssistantLauncher />);
      advance(900);
      expect(greeting()).toBeInTheDocument();
    });
  });
});
