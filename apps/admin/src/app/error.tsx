"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useEffect } from "react";

/** Admin segment hata sınırı. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg p-6">
      <ErrorState onRetry={reset} className="max-w-md" />
    </div>
  );
}
