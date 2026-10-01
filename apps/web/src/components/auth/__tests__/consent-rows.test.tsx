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

function Harness() {
  const [c, setC] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
  });
  return <ConsentRows consents={c} onChange={setC} />;
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
    const link = screen.getByRole("link", { name: "Kullanıcı sözleşmesini" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom gezinmesin
    await user.click(link);
    expect(box).toHaveAttribute("aria-checked", "false");
  });
});
