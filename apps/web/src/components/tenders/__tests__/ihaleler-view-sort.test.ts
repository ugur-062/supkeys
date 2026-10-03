// Derin denetim LU-31: "Yakın Biten" düz artan sıralamaydı — aylar önce
// kapanmış talepler yarın kapanacakların önüne geçiyordu.
import { describe, expect, it } from "vitest";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { sortTenderRows } from "../ihaleler-view";

const NOW = new Date("2026-09-30T09:00:00+03:00").getTime();
const row = (id: string, bidsCloseAt: string | null) =>
  ({ id, bidsCloseAt, createdAt: "2026-09-01T00:00:00Z", publishedAt: null }) as unknown as TenderListItem;

describe("sortTenderRows", () => {
  const rows = [
    row("old", "2026-03-01T12:00:00+03:00"),
    row("draft", null),
    row("nextWeek", "2026-10-07T12:00:00+03:00"),
    row("recentClosed", "2026-09-29T12:00:00+03:00"),
    row("tomorrow", "2026-10-01T12:00:00+03:00"),
  ];

  it("Yakın Biten: gelecektekiler önce (artan), kapanmışlar sonra (en yeni önce), tarihsiz en sonda", () => {
    expect(sortTenderRows(rows, "bidsCloseAt:asc", NOW).map((r) => r.id)).toEqual([
      "tomorrow",
      "nextWeek",
      "recentClosed",
      "old",
      "draft",
    ]);
  });

  it("Geç Biten: düz azalan kalır", () => {
    expect(sortTenderRows(rows, "bidsCloseAt:desc", NOW).map((r) => r.id)).toEqual([
      "nextWeek",
      "tomorrow",
      "recentClosed",
      "old",
      "draft",
    ]);
  });
});
