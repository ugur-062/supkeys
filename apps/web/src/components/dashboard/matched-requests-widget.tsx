"use client";

import { BrowseTenderRow } from "@/components/ihale/BrowseTenderRow";
import { EmptyState } from "@/components/list";
import { useDiscoverListings } from "@/hooks/use-portal-discovery";
import { SECTOR_EDIT_HREF } from "@/lib/company/portals";
import { ArrowRight, Inbox } from "lucide-react";
import Link from "next/link";

/**
 * SİZE UYGUN AÇIK TALEPLER — satış panosunun özet widget'ı.
 *
 * "Anasayfa özet, alt sayfa liste" ilkesi (2026-09-03): eski keşif kartı
 * Açık Talepler sayfasının kopyasıydı — aynı arama kutusu, aynı boş durum,
 * ikinci bir "İlan aç" düğmesi. Aynı işi iki yerde yapmak kullanıcıya iki
 * farklı sonuç kümesi gösteriyor ve hangisinin "gerçek" liste olduğunu
 * belirsizleştiriyordu.
 *
 * Burada: en fazla 3 eşleşen talep (sıralama SUNUCUDA — davet › bağlantı ›
 * kategori), tek çıkış "Tüm açık talepleri gör". Arama, süzgeç ve CTA YOK;
 * hepsi alt sayfada. Satır bileşeni Açık Talepler listesindekiyle AYNI
 * (`BrowseTenderRow compact`) — ikinci bir kart yazılmadı.
 *
 * Boş durumda tek cümle + tek eylem: eşleşme firmanın kategori beyanına
 * göre yapılır, dolayısıyla doğru eylem "sektörleri düzenle"dir. Açık
 * Talepler sayfasındaki "Bağlantı Kur" burada tekrarlanmaz — iki sayfa iki
 * farklı eylem önerince kullanıcı hangisinin işe yaradığını bilemiyordu.
 */
export const MATCHED_REQUESTS_LIMIT = 3;

export { SECTOR_EDIT_HREF };

export function MatchedRequestsWidget() {
  const listings = useDiscoverListings(MATCHED_REQUESTS_LIMIT);
  const rows = listings.data ?? [];

  return (
    <section
      aria-label="Size uygun açık talepler"
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        Size uygun açık talepler
      </h2>

      <div className="mt-4">
        {listings.isLoading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: MATCHED_REQUESTS_LIMIT }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-slate-100 ring-1 ring-slate-200"
              />
            ))}
          </div>
        ) : listings.isError ? (
          <EmptyState
            icon={Inbox}
            title="Açık talepler yüklenemedi."
            variant="no-results"
            className="py-8"
            action={
              <button
                type="button"
                onClick={() => void listings.refetch()}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Tekrar dene
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Eşleşen açık talep yok."
            description="Eşleşme, satış kategorilerinize göre yapılır."
            className="py-8"
            action={
              <Link
                href={SECTOR_EDIT_HREF}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Satış kategorilerini düzenle
              </Link>
            }
          />
        ) : (
          <div role="table" aria-label="Size uygun açık talepler" className="space-y-2">
            {rows.map((r) => (
              <BrowseTenderRow key={r.id} t={r} compact />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href="/company/satis/acik-talepler"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
        >
          Tüm açık talepleri gör
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
