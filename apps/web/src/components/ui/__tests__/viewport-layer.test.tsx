// @vitest-environment jsdom
/**
 * `ViewportLayer` (öykünücü / WebView 124): `<main>` bir kapsayıcı
 * (`@container`), eski motorlar onu `fixed` torunlarının içerik bloğu yapıyor
 * → sayfa içeriğindeki `fixed` öğe `body`ye taşınır.
 *
 *  · Öğe `body`nin doğrudan çocuğu; kapsayıcı `main`in içinde değil.
 *  · SSR'da hiçbir şey çizilmez; hidrasyon uyuşmazlık vermez, ardından portal.
 *  · React bağlamı ve React olayları (ağaç boyunca kabarma) korunur.
 *  · Formun dışına taşınan `type="submit"` düğmesi `form` özniteliğiyle formu gönderir.
 *  · Katman kalkınca öğe `body`den de kalkar.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createContext, useContext, type FormEvent } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewportLayer } from "../viewport-layer";

afterEach(() => {
  // Önce React ağaçları sökülür (portal çocukları da `body`den kalkar).
  cleanup();
  document.body.innerHTML = "";
});

function Page({ open = true }: { open?: boolean }) {
  return (
    <main className="@container/panel" data-testid="main">
      <p>içerik</p>
      {open ? (
        <ViewportLayer>
          <div data-testid="bar" className="fixed inset-x-0 bottom-0 z-20">
            <button type="button">Yayınla</button>
          </div>
        </ViewportLayer>
      ) : null}
    </main>
  );
}

describe("ViewportLayer", () => {
  it("çocuğu body'nin doğrudan çocuğu olarak çizer, kapsayıcı main'in içinde değil", () => {
    render(<Page />);
    const bar = screen.getByTestId("bar");
    expect(bar.parentElement).toBe(document.body);
    expect(screen.getByTestId("main")).not.toContainElement(bar);
    expect(bar).toHaveClass("fixed", "inset-x-0", "bottom-0", "z-20");
  });

  it("katman kalkınca öğe body'den de kalkar", () => {
    const { rerender } = render(<Page />);
    expect(screen.getByTestId("bar")).toBeInTheDocument();
    rerender(<Page open={false} />);
    expect(screen.queryByTestId("bar")).toBeNull();
    expect(document.querySelector(".fixed")).toBeNull();
  });

  it("SSR'da hiçbir şey çizmez; hidrasyon uyuşmazlık vermez, ardından öğe body'de", async () => {
    const html = renderToString(<Page />);
    expect(html).toContain("içerik");
    expect(html).not.toContain("Yayınla");

    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    const onRecoverableError = vi.fn();
    let hydrated: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      hydrated = hydrateRoot(root, <Page />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    const bar = screen.getByTestId("bar");
    expect(bar.parentElement).toBe(document.body);
    expect(root).not.toContainElement(bar);
    act(() => hydrated?.unmount());
    expect(screen.queryByTestId("bar")).toBeNull();
  });

  it("React bağlamı ve React olayları portal boyunca korunur", () => {
    const Ctx = createContext("varsayılan");
    function Label() {
      return <span>{useContext(Ctx)}</span>;
    }
    const onClick = vi.fn();
    render(
      <Ctx.Provider value="satinalma">
        {/* Yalnız React ağacında üst: DOM'da çubuk bu div'in dışında. */}
        <div data-testid="react-ust" onClick={onClick}>
          <ViewportLayer>
            <div data-testid="bar" className="fixed">
              <Label />
              <button type="button">Yayınla</button>
            </div>
          </ViewportLayer>
        </div>
      </Ctx.Provider>,
    );
    const bar = screen.getByTestId("bar");
    expect(screen.getByTestId("react-ust")).not.toContainElement(bar);
    expect(bar).toHaveTextContent("satinalma");
    fireEvent.click(screen.getByRole("button", { name: "Yayınla" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("formun dışına taşınan gönder düğmesi `form` özniteliğiyle formu gönderir", () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <main className="@container">
        <form id="teklif-formu" onSubmit={onSubmit}>
          <input aria-label="Fiyat" />
          <ViewportLayer>
            <div className="fixed inset-x-0 bottom-0">
              <button type="submit" form="teklif-formu">
                Gönder
              </button>
            </div>
          </ViewportLayer>
        </form>
      </main>,
    );
    const btn = screen.getByRole<HTMLButtonElement>("button", { name: "Gönder" });
    const form = document.getElementById("teklif-formu") as HTMLFormElement;
    expect(form).not.toContainElement(btn);
    expect(btn.form).toBe(form);
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
