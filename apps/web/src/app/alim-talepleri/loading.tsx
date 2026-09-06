import { PublicLayout } from "@/components/marketplace/public-layout";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** /alim-talepleri yüklenirken iskelet (PROMPT 4) — kenar süzgeci + talep teaser kartı oranı. */
export default function AlimTalepleriLoading() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-20 lg:px-8" aria-busy="true" aria-label="Alım talepleri yükleniyor">
        <Skeleton className="h-8 w-52" />
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
              <Skeleton className="h-8 w-44 rounded-full" />
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-28 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="mt-4 h-5 w-11/12" />
                  <Skeleton className="mt-2 h-5 w-2/3" />
                  <Skeleton className="mt-5 h-8 w-32" />
                  <SkeletonText lines={2} className="mt-4" />
                  <Skeleton className="mt-4 h-9 w-full rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
