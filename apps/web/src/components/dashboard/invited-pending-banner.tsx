"use client";

import { ArrowRight, AlertTriangle } from "lucide-react";
import Link from "next/link";

/**
 * Anasayfa uyarısı: davet edildiğin ama henüz teklif vermediğin açık ihaleler.
 * count 0 ise hiç render edilmez. href → ilgili açık ihaleler listesi.
 */
export function InvitedPendingBanner({
  count,
  href,
}: {
  count: number;
  href: string;
}) {
  if (!count || count < 1) return null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 transition-colors hover:bg-amber-100"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Davet edildiğiniz {count} ihaleye henüz teklif vermediniz
        </p>
        <p className="text-xs text-amber-700">
          Davetler kapanmadan teklifinizi verin — görüntülemek için tıklayın.
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
    </Link>
  );
}
