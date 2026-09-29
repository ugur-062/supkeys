// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "../search-input";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const input = () => screen.getByPlaceholderText("Ara...") as HTMLInputElement;
const type = (v: string) => fireEvent.change(input(), { target: { value: v } });

// Derin denetim LU-13: URL'e bağlı listelerde gönderilen değer bir sunucu turu
// sonra `value` olarak geri geliyor; o arada yazılan karakterler siliniyordu.
describe("SearchInput dış değer senkronu", () => {
  it("gecikmeli gelen kendi yankısı yeni yazılanı SİLMEZ", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    type("acme");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(onChange).toHaveBeenLastCalledWith("acme");
    type("acme ltd"); // navigasyon bitmeden yazmaya devam
    rerender(<SearchInput value="acme" onChange={onChange} />); // URL geç güncellendi
    expect(input().value).toBe("acme ltd");
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(onChange).toHaveBeenLastCalledWith("acme ltd");
    rerender(<SearchInput value="acme ltd" onChange={onChange} />);
    expect(input().value).toBe("acme ltd");
  });

  it("sırayla gelen ara yankılar metni geri almaz", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    type("a");
    await act(() => vi.advanceTimersByTimeAsync(300));
    type("acme");
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender(<SearchInput value="a" onChange={onChange} />);
    expect(input().value).toBe("acme");
    rerender(<SearchInput value="acme" onChange={onChange} />);
    expect(input().value).toBe("acme");
  });

  it("gerçek dış değişikliği (filtre temizleme, geri) yansıtır", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    type("acme");
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender(<SearchInput value="acme" onChange={onChange} />);
    rerender(<SearchInput value="" onChange={onChange} />);
    expect(input().value).toBe("");
    rerender(<SearchInput value="beta" onChange={onChange} />);
    expect(input().value).toBe("beta");
  });
});
