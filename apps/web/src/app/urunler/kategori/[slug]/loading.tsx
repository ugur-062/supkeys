import { PublicLayout } from "@/components/marketplace/public-layout";
import { Skeleton, SkeletonCard, SkeletonText } from "@/components/ui/skeleton";

/**
 * /urunler/kategori/<kod> yüklenirken iskelet (PROMPT 3, /urunler ile aynı düzen): gerçek düzenle aynı ızgara
 * (kenar süzgeci 16rem + 3 sütun kart, 4:3 görsel) — içerik gelince zıplama
 * (CLS) yok. Kabuk (header/footer) da burada: sayfa geçişinde başlık kaybolmasın.
 */
export default function UrunlerKategoriLoading() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-20 lg:px-8" aria-busy="true" aria-label="Ürünler yükleniyor">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden space-y-6 lg:block">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <SkeletonText lines={4} />
              </div>
            ))}
          </aside>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i}>
                  <SkeletonCard />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
