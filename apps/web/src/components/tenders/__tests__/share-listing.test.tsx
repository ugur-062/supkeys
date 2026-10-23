// @vitest-environment jsdom
/**
 * Arayüz testi D-253: pano izni reddedilince "Bağlantıyı kopyala" sessiz
 * kalıyordu — kullanıcı tıklamanın boşa gittiğini anlamıyordu.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ShareListing } from "../share-listing";

afterEach(() => vi.clearAllMocks());

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("ShareListing — kopyala", () => {
  it("pano izni reddedilince hata bildirimi gösterir", async () => {
    render(<ShareListing publicPath="/talep/rot-000001-rulman" title="Rulman" />);
    // userEvent.setup kendi pano sahtesini kurar → reddeden sahteyi SONRA kur.
    const user = userEvent.setup();
    mockClipboard(() => Promise.reject(new Error("NotAllowedError")));
    await user.click(screen.getByRole("button", { name: /kopyala/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("başarılı kopyada başarı bildirimi", async () => {
    render(<ShareListing publicPath="/talep/rot-000001-rulman" title="Rulman" />);
    const user = userEvent.setup();
    mockClipboard(() => Promise.resolve());
    await user.click(screen.getByRole("button", { name: /kopyala/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
