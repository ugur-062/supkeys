// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CountryCombobox } from "../country-combobox";

function Harness({ codes }: { codes?: string[] }) {
  const [v, setV] = useState("TR");
  return (
    <>
      <CountryCombobox value={v} onChange={setV} codes={codes} ariaLabel="Ülke" />
      <output data-testid="val">{v}</output>
    </>
  );
}

describe("CountryCombobox (2026-09-27, kayıt tüm ülkelere açık)", () => {
  it("Türkçe karakterden bağımsız adla arar ve seçer", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "ozbek");
    await user.click(await screen.findByRole("option", { name: /Özbekistan/ }));
    expect(screen.getByTestId("val")).toHaveTextContent("UZ");
  });

  it("ISO koduyla da bulur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "lk");
    expect(await screen.findByRole("option", { name: /Sri Lanka/ })).toBeInTheDocument();
  });

  it("izin verilmeyen kod (kayda kapalı ülke) listede çıkmaz", async () => {
    const user = userEvent.setup();
    render(<Harness codes={["TR", "DE"]} />);
    const box = screen.getByRole("combobox", { name: "Ülke" });
    await user.clear(box);
    await user.type(box, "amerika");
    expect(screen.queryByRole("option", { name: /Amerika/ })).not.toBeInTheDocument();
  });
});
