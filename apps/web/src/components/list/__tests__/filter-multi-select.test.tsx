// @vitest-environment jsdom
/**
 * Arayüz testi D-247: "Tümü" satırı gerçek Listbox seçeneği — klavyeyle
 * (ok / Home) ulaşılır; dış değer sentinel'i hiç görmez.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterMultiSelect, nextMultiValue } from "../filter-multi-select";

const OPTIONS = [
  { value: "OPEN", label: "Açık" },
  { value: "DRAFT", label: "Taslak" },
];

describe("nextMultiValue", () => {
  it("Tümü seçiliyken bir seçenek eklenince yalnız o seçenek", () => {
    expect(nextMultiValue([], ["__filter_all__", "OPEN"])).toEqual(["OPEN"]);
  });
  it("seçim varken Tümü seçilince temizlenir", () => {
    expect(nextMultiValue(["OPEN"], ["OPEN", "__filter_all__"])).toEqual([]);
  });
  it("normal ekle/çıkar aynen geçer", () => {
    expect(nextMultiValue(["OPEN"], ["OPEN", "DRAFT"])).toEqual(["OPEN", "DRAFT"]);
    expect(nextMultiValue(["OPEN"], [])).toEqual([]);
  });
});

describe("FilterMultiSelect", () => {
  it("Tümü satırı role=option ve klavyeyle seçilebilir", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterMultiSelect
        value={["OPEN"]}
        onChange={onChange}
        options={OPTIONS}
        allLabel="Tüm Durumlar"
        ariaLabel="Durum"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Durum" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual(["Tüm Durumlar", "Açık", "Taslak"]);
    await user.keyboard("{Home}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
