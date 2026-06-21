"use client";

import { Badge } from "@/components/catalyst/badge";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Sparkles } from "lucide-react";

interface InvitationBannerProps {
  type: "demo" | "supplier";
  expiresAt: string;
  tenantName?: string;
  message?: string | null;
  email?: string | null;
}

export function InvitationBanner({
  type,
  expiresAt,
  tenantName,
  message,
  email,
}: InvitationBannerProps) {
  const expiresDate = new Date(expiresAt);
  const remaining = formatDistanceToNow(expiresDate, {
    locale: tr,
    addSuffix: false,
  });
  const formatted = format(expiresDate, "d MMMM yyyy, HH:mm", { locale: tr });

  const heading =
    type === "demo"
      ? "Supkeys ekibi sizi davet etti"
      : `${tenantName ?? "Bir firma"} sizi tedarikçi olarak davet etti`;

  const subtitle =
    type === "demo"
      ? "E-postanızı doğruladıktan sonra hesabınız OTOMATİK aktif olacak ve giriş yapabileceksiniz."
      : "Başvurunuzu tamamladıktan sonra Supkeys ekibi inceleyecek; onaylanırsa tedarikçi paneline erişeceksiniz.";

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-50 via-zinc-50 to-zinc-50 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <h3 className="font-display font-bold text-zinc-900 text-base leading-tight">
            {heading}
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-700 pt-1">
            <Badge color="zinc" className="gap-1.5">
              <Sparkles className="w-3 h-3" />
              {remaining} sonra geçersiz
            </Badge>
            <span className="text-slate-500">{formatted}</span>
            {email ? (
              <span className="text-slate-500">
                · Davet edilen: <span className="font-medium text-slate-700">{email}</span>
              </span>
            ) : null}
          </div>
          {message ? (
            <blockquote className="mt-3 text-sm text-slate-700 italic border-l-2 border-zinc-300 pl-3 py-1 bg-white/50 rounded-r-md">
              &ldquo;{message}&rdquo;
            </blockquote>
          ) : null}
        </div>
      </div>
    </div>
  );
}
