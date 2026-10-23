// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";

/**
 * Mobil denetim 2026-10 g07: tablo her zaman `--gutter` kadar kenara
 * taşıyordu; `sm` altında içteki telafi çalışmadığı için
 * `card px-2 [--gutter:--spacing(4)]` kartlarında tablo telefonda kartın
 * 8 px dışına çıkıyordu. Taşma artık yalnız `bleed` tablolarda; varsayılan
 * tablo kabın içerik kutusunda kalır (sm+ durağan görünüm aynı).
 */
function Sample({ bleed }: { bleed?: boolean }) {
  return (
    <div className="card px-2 [--gutter:--spacing(4)]">
      <Table dense bleed={bleed} data-testid="scroller">
        <TableHead>
          <TableRow>
            <TableHeader>Kalem</TableHeader>
            <TableHeader>Miktar</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Boru</TableCell>
            <TableCell>10</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

const classes = (el: Element) => el.className.split(/\s+/);

describe("Catalyst Table kenar taşması", () => {
  it("varsayılan tablo taşmaz; ilk/son hücre telefonda 8 px, sm+ 4 px", () => {
    render(<Sample />);
    const scroller = screen.getByTestId("scroller");
    expect(classes(scroller)).not.toContain("-mx-(--gutter)");
    expect(classes(scroller)).toEqual(expect.arrayContaining(["overflow-x-auto", "whitespace-nowrap"]));
    expect(classes(scroller.firstElementChild!)).not.toContain("sm:px-(--gutter)");
    for (const cell of [screen.getByText("Kalem"), screen.getByText("Boru")]) {
      expect(classes(cell)).toEqual(expect.arrayContaining(["first:pl-2", "last:pr-2", "sm:first:pl-1", "sm:last:pr-1"]));
      expect(cell.className).not.toContain("--gutter");
    }
  });

  it("bleed tablo Catalyst gibi kenara taşar, ilk/son hücre gutter kadar içeride", () => {
    render(<Sample bleed />);
    expect(classes(screen.getByTestId("scroller"))).toContain("-mx-(--gutter)");
    expect(classes(screen.getByText("Boru"))).toEqual(
      expect.arrayContaining(["first:pl-(--gutter,--spacing(2))", "last:pr-(--gutter,--spacing(2))"]),
    );
  });
});
