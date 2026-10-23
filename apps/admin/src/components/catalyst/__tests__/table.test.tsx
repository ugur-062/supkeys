// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";

function sizeScrollBox(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

function renderTable() {
  return render(
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>İş</TableHeader>
          <TableHeader>Durum</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>views.purge</TableCell>
          <TableCell>Başarılı</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("Table — dar ekran kaydırma ipucu (arayüz testi D-229 / webC-15)", () => {
  it("içerik yatayda taşınca 'yana kaydırın' ipucu çizilir", () => {
    sizeScrollBox(728, 340);
    renderTable();
    expect(screen.getByText(/tabloyu yana kaydırın/)).toBeInTheDocument();
  });

  it("taşma yoksa ipucu yok", () => {
    sizeScrollBox(900, 900);
    renderTable();
    expect(screen.queryByText(/tabloyu yana kaydırın/)).not.toBeInTheDocument();
  });
});
