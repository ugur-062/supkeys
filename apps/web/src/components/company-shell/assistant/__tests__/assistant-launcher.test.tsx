// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
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

beforeEach(() => {
  sessionStorage.clear();
  h.path = "/company/satis";
  h.tier = "GOLD";
  h.user = SELLER;
  setWidth(1440);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
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

  it.each(["/company/mesajlar", "/company/satinalma/taleplerim/yeni", "/company/ilan/x/teklif-ver"])(
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
    render(<AssistantLauncher />);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByText("Rothern Asistanı")).toBeNull();
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
    expect(screen.getByRole("button", { name: "AI Asistan" }).style.bottom).toBe("88px");
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
