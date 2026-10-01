"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { ErrorState } from "@/components/ui/error-state";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { reportClientError } from "@/lib/client-error";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Hata sınırı "Tekrar dene" (arayüz testi D-219 + O-112'nin admin kısmı):
 * yalnız `reset()` çağrılıyordu → önbellekteki bozuk/başarısız sorgu verisi
 * yeniden kullanılıyor (staleTime 60 sn) ve sunucu yükü yeniden çekilmiyordu,
 * hata kartı kalıyordu. Önbellek sıfırlanır, rota tazelenir, segment yeniden
 * çizilir.
 */
export function useBoundaryRetry(reset: () => void) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const retry = () => {
    startTransition(() => {
      void queryClient.resetQueries();
      router.refresh();
      reset();
    });
  };
  return { retry, isPending };
}

/**
 * Admin hata sınırlarının ortak gövdesi. `withShell` iken (oturum açık ve
 * giriş sayfası dışında) üst çubuk + menü korunur: önceden hata ekranı
 * kabuğun ÜSTÜNDE çiziliyordu, kullanıcı başka sayfaya geçemiyordu (D-219).
 */
export function RouteErrorFallback({
  error,
  reset,
  withShell,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  withShell: boolean;
}) {
  const { retry, isPending } = useBoundaryRetry(reset);

  useEffect(() => {
    console.error(error);
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  const body = (
    <ErrorState
      onRetry={isPending ? undefined : retry}
      className="max-w-md"
    />
  );

  if (withShell) {
    return (
      <AdminShell>
        <div className="flex justify-center py-12">{body}</div>
      </AdminShell>
    );
  }
  return (
    <div className="bg-admin-bg flex min-h-screen items-center justify-center p-6">
      {body}
    </div>
  );
}

/** Kabuğun çizilebileceği durum: oturum açık ve giriş sayfası değil. */
export function useCanShowShell(): boolean {
  const { admin } = useAdminAuth();
  const pathname = usePathname();
  return !!admin && pathname !== "/admin/login";
}
