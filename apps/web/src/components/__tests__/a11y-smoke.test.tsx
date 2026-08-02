// @vitest-environment jsdom
/**
 * P3 (frontend denetimi §4.3 + §7) — axe smoke testi. Paylaşılan
 * primitive'lerden kurulmuş temsili bir sayfa iskeletini axe'ten geçirir:
 * başlık sırası (h1→h2→h3), landmark'lar, buton/link erişilebilir adları,
 * aria-* doğruluğu. Primitive'lerde yapılacak bir gerileme (ör. StatusBadge
 * dot'unun aria-hidden'ının düşmesi, ViewToggle'ın adsız kalması) burada
 * yakalanır. Renk kontrastı jsdom'da hesaplanamaz (incomplete sayılır) —
 * bilinçli kapsam dışı.
 */
import { ActiveFilterChips } from "@/components/list/active-filter-chips";
import { EmptyState } from "@/components/list/empty-state";
import { ViewToggle } from "@/components/list/view-toggle";
import { Money } from "@/components/ui/money";
import { MetaTag, StatusBadge } from "@/components/ui/status-badge";
import { WaitingState } from "@/components/ui/waiting-state";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { Package } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

function SamplePage() {
  return (
    <>
      <a href="#icerik">İçeriğe geç</a>
      <main id="icerik">
        <h1>Siparişlerim</h1>
        <StatusBadge tone="pending">Onay Bekliyor</StatusBadge>
        <MetaTag>Satış siparişi</MetaTag>
        <Money value="42119.9" currency="TRY" />

        <section>
          <h2>Filtreler</h2>
          <ViewToggle view="cards" onChange={vi.fn()} />
          <ActiveFilterChips
            filters={[
              { key: "s", label: "Onay Bekliyor", onRemove: vi.fn() },
              { key: "r", label: "Son 30 Gün", onRemove: vi.fn() },
            ]}
            onClearAll={vi.fn()}
          />
        </section>

        <section>
          <h2>Belgeler</h2>
          <h3>Teslim Belgesi</h3>
          <WaitingState
            title="Satıcı yükler"
            meta="İkinci Firma Ltd · 2 Ağu 19:01'den beri"
            size="sm"
          />
        </section>

        <section>
          <h2>Sonuçlar</h2>
          <EmptyState
            icon={Package}
            title="Eşleşen sipariş yok"
            description="Filtreleri değiştirip tekrar dene."
            variant="no-results"
            action={<button type="button">Filtreleri Temizle</button>}
          />
        </section>
      </main>
    </>
  );
}

describe("a11y smoke — paylaşılan primitive'ler + sayfa iskeleti", () => {
  it("axe ihlali yok (başlık sırası, landmark, erişilebilir adlar)", async () => {
    const { container } = render(<SamplePage />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("bozuk başlık sırası axe tarafından yakalanır (kural canlı kanıtı)", async () => {
    const { container } = render(
      <main>
        <h1>Başlık</h1>
        <h4>Sıra atlanmış alt başlık</h4>
      </main>,
    );
    const results = await axe(container, {
      runOnly: ["heading-order"],
    });
    expect(results.violations.map((v) => v.id)).toContain("heading-order");
  });
});
