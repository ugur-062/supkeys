// @vitest-environment jsdom
/**
 * MOBİL DENETİM g04 (yeniden doğrulama): dokunmatikte Enter yeni satır açtığı
 * için çok satırlı mesaj olağan; yazma kutusu tek satırda (41 px) kalıyor,
 * önceki satırlar yukarı kayıyordu — kullanıcı göndermeden önce mesajını
 * okuyamıyordu. Kutu içeriğine göre büyür (tavan `max-h-32`), gönderince
 * tek satıra iner. Gönder'e basış odağı kutudan almaz (klavye açık kalır).
 * Toast'lar (gönderim hatası) kutunun üstünde çıkar.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  send: vi.fn(async (content: string) => {
    void content;
  }),
  clearance: vi.fn(),
  clearanceRef: null as { current: HTMLElement | null } | null,
}));

vi.mock("@/hooks/use-company-messages", () => ({
  useThreadMessages: () => ({ data: { messages: [] }, isLoading: false }),
  useSendMessage: () => ({ mutateAsync: (content: string) => h.send(content), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { roles: ["SATIN_ALMACI"] },
    company: { tier: "GOLD", companyVerificationStatus: "VERIFIED" },
  }),
}));
vi.mock("@/components/providers/app-toaster", () => ({
  useToastBottomClearance: (ref: { current: HTMLElement | null }, enabled: boolean) => {
    h.clearanceRef = ref;
    h.clearance(enabled);
  },
}));

import { CompanyMessageThread, fitComposer } from "../company-message-thread";

const LINE = 20;
const PADDING = 16;
let restoreScrollHeight: (() => void) | null = null;

/** jsdom yerleşim yapmaz: scrollHeight = satır sayısı × 20 + iç boşluk. */
function fakeScrollHeight() {
  const proto = HTMLTextAreaElement.prototype;
  const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return this.value.split("\n").length * LINE + PADDING;
    },
  });
  restoreScrollHeight = () => {
    delete (proto as unknown as Record<string, unknown>).scrollHeight;
    if (original) Object.defineProperty(Element.prototype, "scrollHeight", original);
  };
}

beforeEach(() => {
  h.send.mockClear();
  h.clearance.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  restoreScrollHeight?.();
  restoreScrollHeight = null;
});

const renderThread = () =>
  render(<CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />);

describe("fitComposer", () => {
  it("yükseklik = içerik + kenarlık (border-box)", () => {
    const el = document.createElement("textarea");
    Object.defineProperty(el, "scrollHeight", { value: 107 });
    Object.defineProperty(el, "offsetHeight", { value: 41 });
    Object.defineProperty(el, "clientHeight", { value: 39 });
    fitComposer(el);
    expect(el.style.height).toBe("109px");
  });

  it("ölçülemeyen kutuya (gizli / scrollHeight 0) yükseklik yazılmaz", () => {
    const el = document.createElement("textarea");
    el.style.height = "80px";
    fitComposer(el);
    expect(el.style.height).toBe("");
    expect(() => fitComposer(null)).not.toThrow();
  });
});

describe("Mesaj kutusu — içeriğe göre büyür", () => {
  it("4 satırda 4 satır boyu; tavan sınıfta (max-h-32); gönderince tek satıra iner", async () => {
    fakeScrollHeight();
    renderThread();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.className).toMatch(/(^|\s)max-h-32(\s|$)/);
    expect(box).toHaveAttribute("rows", "1");

    fireEvent.change(box, { target: { value: "satır 1\nsatır 2\nsatır 3\nsatır 4" } });
    expect(box.style.height).toBe(`${4 * LINE + PADDING}px`);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    });
    expect(h.send).toHaveBeenCalledWith("satır 1\nsatır 2\nsatır 3\nsatır 4");
    expect(box.value).toBe("");
    expect(box.style.height).toBe(`${LINE + PADDING}px`);
  });

  it("Gönder'e basış odağı kutudan almaz (ekran klavyesi açık kalır)", () => {
    renderThread();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Merhaba" } });
    const send = screen.getByRole("button", { name: "Gönder" });
    // `false` = varsayılan (odak taşıma) engellendi.
    expect(fireEvent.mouseDown(send)).toBe(false);
  });

  it("yazma alanı toast'lara kendini bildirir (alt pay kutunun üstüne çıkar)", () => {
    renderThread();
    const composer = screen.getByRole("textbox").closest("div.border-t") as HTMLElement;
    expect(h.clearance).toHaveBeenLastCalledWith(true);
    expect(h.clearanceRef?.current).toBe(composer);
  });

  it("ekran boyutu değişince (telefonu yan çevirme) yükseklik yeniden ölçülür", () => {
    fakeScrollHeight();
    renderThread();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "satır 1\nsatır 2" } });
    // Eski genişlikte ölçülmüş yükseklik (satırlar yeni genişlikte farklı sarar).
    box.style.height = "999px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(box.style.height).toBe(`${2 * LINE + PADDING}px`);
  });
});
