// @vitest-environment jsdom
/**
 * Admin Button tek uçuş (arayüz testi FX-00 O-045): `onClick` promise dönerse
 * çözülene dek düğme kilitli — hızlı çift tık ikinci isteği atmaz. Senkron
 * işleyiciler etkilenmez.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../button";

describe("Button", () => {
  it("promise dönen onClick: çift tık tek çağrı, bitince yeniden açık", async () => {
    let resolve!: () => void;
    const onClick = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <Button type="button" onClick={onClick}>
        Kaydet
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Kaydet" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("senkron onClick her tıkta çalışır", () => {
    const onClick = vi.fn();
    render(
      <Button type="button" onClick={onClick}>
        Aç
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Aç" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
