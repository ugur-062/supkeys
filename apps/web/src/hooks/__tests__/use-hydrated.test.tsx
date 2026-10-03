// @vitest-environment jsdom
/**
 * `useHydrated` (derin denetim X13): "şimdi"ye bağlı metin ISR HTML'ine
 * basılmaz; hidrasyon sunucu değeriyle eşleşir (uyuşmazlık yok), ardından
 * istemci değeri çizilir.
 */
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useHydrated } from "../use-hydrated";

function Probe() {
  return <span>{useHydrated() ? `client-${Date.now()}` : "ssr"}</span>;
}

describe("useHydrated", () => {
  it("sunucuda false, istemci render'ında true", () => {
    expect(renderToString(<Probe />)).toContain("ssr");
    render(<Probe />);
    expect(screen.getByText(/^client-/)).toBeTruthy();
  });

  it("hidrasyon uyuşmazlık vermez, sonra istemci değerine geçer", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, <Probe />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/^client-/);
  });
});
