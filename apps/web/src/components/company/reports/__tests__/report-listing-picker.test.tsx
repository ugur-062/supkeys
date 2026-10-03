// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rapor talep seçicisi (arayüz testi webB-1:NEW-1): sunucu en yeni N talebi
 * döner; liste kesildiğinde bu yazılır, daha eskisi numara/başlıkla aranır,
 * seçili talep pencere dışında kalsa da sunucuya `selected` olarak gider.
 */
const h = vi.hoisted(() => ({
  calls: [] as { q?: string; selected?: string; excludeDrafts?: boolean }[],
  data: undefined as unknown,
}));

vi.mock("@/hooks/use-company-reports", () => ({
  useReportListingOptions: (params: {
    q?: string;
    selected?: string;
    excludeDrafts?: boolean;
  }) => {
    h.calls.push(params);
    return { data: h.data };
  },
}));

import { ReportListingPicker } from "../report-listing-picker";

const opt = (n: number) => ({
  id: `l${n}`,
  tenderNumber: `ROT-${String(n).padStart(6, "0")}`,
  title: `Talep ${n}`,
  status: "OPEN",
});

beforeEach(() => {
  h.calls = [];
  h.data = { items: [opt(3), opt(2)], total: 2, limit: 500 };
});

const props = { label: "Satın Alma Talebi", placeholder: "— Seçin —" };

describe("ReportListingPicker", () => {
  it("liste kesilmediyse not yok; seçenekler numara — başlık", () => {
    render(<ReportListingPicker {...props} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "ROT-000003 — Talep 3" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("toplam pencereden büyükse kesildiği ve aramanın yolu yazılır", () => {
    h.data = { items: [opt(505)], total: 505, limit: 500 };
    render(<ReportListingPicker {...props} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Toplam 505 talebin en yeni 500 tanesi listeleniyor. Daha eskisi için numara veya başlıkla arayın.",
    );
  });

  it("arama kutusu yazım bitince sunucuya q gönderir; seçim de selected olarak gider", async () => {
    const user = userEvent.setup();
    render(<ReportListingPicker {...props} value="l23" onChange={vi.fn()} excludeDrafts />);
    expect(h.calls.at(-1)).toEqual({ q: "", selected: "l23", excludeDrafts: true });

    await user.type(screen.getByRole("searchbox", { name: "Satın alma talebi ara" }), "ROT-000023");
    await waitFor(() => expect(h.calls.at(-1)?.q).toBe("ROT-000023"));
    expect(h.calls.at(-1)).toMatchObject({ selected: "l23", excludeDrafts: true });
  });

  it("aramayla eşleşen yoksa bunu söyler", async () => {
    const user = userEvent.setup();
    render(<ReportListingPicker {...props} value="" onChange={vi.fn()} />);
    h.data = { items: [], total: 0, limit: 500 };
    await user.type(screen.getByRole("searchbox"), "yok");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Aramayla eşleşen satın alma talebi yok.",
    );
  });

  it("seçim onChange'e talep id'siyle gider", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReportListingPicker {...props} value="" onChange={onChange} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Satın Alma Talebi" }), "l2");
    expect(onChange).toHaveBeenCalledWith("l2");
  });
});
