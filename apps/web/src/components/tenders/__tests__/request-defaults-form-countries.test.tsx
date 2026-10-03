// @vitest-environment jsdom
/**
 * Derin denetim S084 — "Seçili ülkeler" kipinde son ülkenin × düğmesi
 * `targetCountries: []` yazıyordu; boş liste "tüm ülkeler" demek olduğundan
 * kip sessizce genişliyordu. Son ülke çıkarılamaz; yenisi eklenince çıkar.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";

vi.mock("@/hooks/use-company-addresses", () => ({ useAddresses: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ company: { country: "TR" } }) }));

import { RequestDefaultsForm } from "../request-defaults-form";

let last: RequestDefaults | null = null;
function Harness({ countries }: { countries: string[] }) {
  const [v, setV] = useState<RequestDefaults>({ ...REQUEST_DEFAULTS_FALLBACK, targetCountries: countries });
  return (
    <RequestDefaultsForm
      value={v}
      onChange={(n) => {
        last = n;
        setV(n);
      }}
      only={["scope"]}
    />
  );
}

describe("RequestDefaultsForm — seçili ülkeler (S084)", () => {
  it("tek kalan ülke çıkarılamaz; iki ülkeden biri çıkarılabilir", () => {
    render(<Harness countries={["TR", "DE"]} />);
    const removeButtons = () => screen.getAllByRole("button", { name: /çıkar/i });
    expect(removeButtons()).toHaveLength(2);
    fireEvent.click(removeButtons()[0]!);
    expect(last?.targetCountries).toEqual(["DE"]);
    expect(removeButtons()).toHaveLength(1);
    expect(removeButtons()[0]).toBeDisabled();
    fireEvent.click(removeButtons()[0]!);
    expect(last?.targetCountries).toEqual(["DE"]);
  });
});
