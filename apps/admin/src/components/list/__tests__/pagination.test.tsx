// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../pagination";

// Derin denetim LU-13: son sayfa boşalınca (onay/red) `page > totalPages`
// kalıyor, "25 kayıt içinden 26-25 arası" + boş tablo görünüyordu.
describe("Pagination sayfa taşması", () => {
  it("toplam sayfayı aşan sayfayı son sayfaya çeker ve aralığı tutarlı gösterir", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={1} total={25} pageSize={25} onPageChange={onPageChange} />);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(screen.getByText("25 kayıt içinden 1-25 arası")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page");
  });

  it("aynı taşma için düzeltmeyi yeniden render'da tekrar istemez", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={3} totalPages={2} total={30} pageSize={25} onPageChange={onPageChange} />);
    rerender(<Pagination page={3} totalPages={2} total={30} pageSize={25} onPageChange={() => onPageChange(2)} />);
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it("geçici 0 toplamda (yükleniyor) sayfayı değiştirmez", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={1} total={0} pageSize={25} onPageChange={onPageChange} />);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("kayıt yokken hiç çizilmez — boş tabloda çift mesaj ve tek '1' düğmesi yok (arayüz testi D-145)", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={0} pageSize={25} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Kayıt yok")).toBeNull();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });

  it("geçerli sayfada dokunmaz", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={2} total={30} pageSize={25} onPageChange={onPageChange} />);
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByText("30 kayıt içinden 26-30 arası")).toBeTruthy();
  });
});
