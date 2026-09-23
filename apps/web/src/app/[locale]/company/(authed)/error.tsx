"use client";

import { ErrorState } from "@/components/ui/error-state";
import { reportClientError } from "@/lib/client-error";
import { useEffect } from "react";

/**
 * Authed alan hata sınırı — CompanyShell içinde render olur (nav/topbar durur),
 * yalnız sayfa içeriği hata UI'ıyla değişir. reset() sayfayı yeniden dener.
 */
export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="p-6">
      <ErrorState onRetry={reset} className="mx-auto max-w-md" />
    </div>
  );
}
