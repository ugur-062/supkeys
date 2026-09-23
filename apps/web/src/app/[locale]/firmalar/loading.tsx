import { PublicLayout } from "@/components/marketplace/public-layout";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** /firmalar yüklenirken iskelet (PROMPT 4) — kenar süzgeci + 3 sütun firma kartı oranı. */
export default function FirmalarLoading() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-20 lg:px-8" aria-busy="true" aria-label="Firmalar yükleniyor">
        <Skeleton className="h-8 w-40" />
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
              <Skeleton className="h-8 w-48 rounded-full" />
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <li key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-12 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
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
