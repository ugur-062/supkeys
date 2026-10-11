// @vitest-environment jsdom
/**
 * Talep satırı sütun ikonları DİLDEN BAĞIMSIZ (derin denetim S076): EN/RU
 * etiketleri ("Closing", "Закрытие") Türkçe alt-dize sezgiseline uymadığı
 * için tüm sütunlar genel ikonla çiziliyor, kapanış vurgusu ve kalan süre
 * pili kayboluyordu. Çağıranlar `icon` verir; bu test EN katalogla koşar.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TenderListItem } from "@/hooks/use-company-tenders";

vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("en", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  return {
    useTranslations: (namespace?: string) =>
      createTranslator({ locale: "en", messages: MESSAGES, namespace: namespace as never, timeZone: TZ, onError: () => {} }),
    useLocale: () => "en",
    useMessages: () => MESSAGES,
    useFormatter: () => createFormatter({ locale: "en", timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/company/satinalma/taleplerim",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../IhaleItemsPanel", () => ({
  IhaleItemsPanel: () => <div data-testid="items-panel" />,
}));

import { IhaleListRow } from "../IhaleListRow";

const ROW = {
  id: "l55",
  tenderNumber: "ROT-000055",
  title: "Stainless pipe",
  type: "ALIM",
  format: null,
  status: "IN_AWARD",
  isInternational: false,
  categoryIds: ["40171501"],
  categories: [{ code: "40171501", name: "Steel pipe" }],
  extraCategoryCount: 0,
  createdById: "u1",
  createdBy: { firstName: "Ada", lastName: "Smith" },
  invitationCount: 4,
  bidCount: 2,
  publishedAt: "2026-08-20T09:00:00.000Z",
  bidsCloseAt: "2026-09-01T09:00:00.000Z",
  createdAt: "2026-08-19T09:00:00.000Z",
} as unknown as TenderListItem;

describe("IhaleListRow — EN", () => {
  it("Kapanış sütunu kapanış ikonunu taşır ve süre notu onun altına iner", () => {
    render(<IhaleListRow t={ROW} favorite={false} onToggleFavorite={vi.fn()} />);
    const dt = screen.getByText("Closing").closest("dt")!;
    expect(dt.querySelector(".bg-rose-50")).not.toBeNull();
    const column = dt.parentElement!;
    expect(column.querySelector("dd.bg-rose-50")).not.toBeNull();
    const category = screen.getByText("Category").closest("dt")!;
    expect(category.querySelector(".bg-slate-100")).not.toBeNull();
  });
});
