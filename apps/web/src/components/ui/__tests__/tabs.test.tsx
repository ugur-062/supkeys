// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "../tabs";

/**
 * Arayüz testi webA-03 yeniden doğrulama: `#belgeler` çapası sekmeyi
 * seçiyordu ama sayfa kaydırılmıyordu — panel yalnız seçilince bağlandığı
 * için ne tarayıcı ne `useScrollToHash` öğeyi bulabiliyordu.
 */
const items = [
  { id: "ozellikler", label: "Özellikler", content: <p>özellik içeriği</p> },
  { id: "belgeler", label: "Belgeler", content: <p>belge içeriği</p> },
];

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  vi.restoreAllMocks();
});

describe("Tabs hashSync", () => {
  it("çapadaki sekmeyi seçer ve sekme çubuğunu görünür alana kaydırır", () => {
    window.history.replaceState(null, "", "#belgeler");
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<Tabs items={items} hashSync />);
    expect(screen.getByText("belge içeriği")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole("tablist"));
  });

  it("çapa sekme değilse kaydırmaz (başka bölüm çapası useScrollToHash'e kalır)", () => {
    window.history.replaceState(null, "", "#bilgi-iste");
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<Tabs items={items} hashSync />);
    expect(screen.getByText("özellik içeriği")).toBeInTheDocument();
    expect(scroll).not.toHaveBeenCalled();
  });
});
