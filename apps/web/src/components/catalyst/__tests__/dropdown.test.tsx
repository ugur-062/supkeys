// @vitest-environment jsdom
/**
 * Açılır menü katmanı (arayüz testi Y-06, O-066): menü <body> sonuna portal
 * olarak çizilir; z-index'i olmadığında firma profilindeki `relative z-10`
 * başlık satırı ve kabuğun `fixed z-30` kenar çubuğu menünün üstüne çıkıp
 * "Engelle" / "İç Notlar" tıklamalarını yutuyordu.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from "../dropdown";

describe("DropdownMenu katmanı", () => {
  it("menü kabuğun kenar çubuğu (z-30) ve başlık satırlarının (z-10) üstünde: z-50", async () => {
    const user = userEvent.setup();
    render(
      <Dropdown>
        <DropdownButton>Menü</DropdownButton>
        <DropdownMenu anchor="bottom end">
          <DropdownItem>Engelle</DropdownItem>
        </DropdownMenu>
      </Dropdown>,
    );
    await user.click(screen.getByRole("button", { name: "Menü" }));
    const menu = await screen.findByRole("menu");
    expect(menu.className).toMatch(/(^|\s)z-50(\s|$)/);
  });
});
