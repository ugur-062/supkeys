"use client";

import { ErrorState } from "@/components/ui/error-state";
import { reportClientError } from "@/lib/client-error";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

/**
 * Authed alan hata sınırı — CompanyShell içinde render olur (nav/topbar durur),
 * yalnız sayfa içeriği hata UI'ıyla değişir.
 *
 * "Tekrar dene" yalnız `reset()` çağırıyordu (arayüz testi D-362, O-112):
 * hata BOZUK VERİDEN çıktıysa sorgu önbelleği aynı veriyi 60 sn (staleTime)
 * tutuyor, yeniden çizim istek atmadan aynı hatayı veriyordu; sunucu bileşeni
 * hatasında da Next önbellekteki başarısız yükü yeniden çekmiyordu. Önce
 * sorgular SIFIRLANIR (etkin olanlar yeniden çekilir, bileşeni sökülenler
 * yeniden takılınca), sonra rota tazelenir ve sınır sıfırlanır.
 */
export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  const retry = () => {
    void queryClient.resetQueries();
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className="p-6">
      <ErrorState onRetry={retry} className="mx-auto max-w-md" />
    </div>
  );
}
