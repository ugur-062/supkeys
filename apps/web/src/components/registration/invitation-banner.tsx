"use client";

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
      ? "🎉 Supkeys ekibi sizi davet etti"
      : `🎉 ${tenantName ?? "Bir firma"} sizi tedarikçi olarak davet etti`;

  const subtitle =
    type === "demo"
      ? "E-postanızı doğruladıktan sonra hesabınız OTOMATİK aktif olacak ve giriş yapabileceksiniz."
      : "Başvurunuzu tamamladıktan sonra Supkeys ekibi inceleyecek; onaylanırsa tedarikçi paneline erişeceksiniz.";

  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 via-indigo-50 to-brand-50 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="text-3xl flex-shrink-0">🎉</div>
        <div className="flex-1 min-w-0 space-y-2">
          <h3 className="font-display font-bold text-brand-900 text-base leading-tight">
            {heading}
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-brand-700 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/70 border border-brand-200 font-medium">
              <Sparkles className="w-3 h-3" />
              {remaining} sonra geçersiz
            </span>
            <span className="text-slate-500">{formatted}</span>
            {email ? (
              <span className="text-slate-500">
                · Davet edilen: <span className="font-medium text-slate-700">{email}</span>
              </span>
            ) : null}
          </div>
          {message ? (
            <blockquote className="mt-3 text-sm text-slate-700 italic border-l-2 border-brand-300 pl-3 py-1 bg-white/50 rounded-r-md">
              &ldquo;{message}&rdquo;
            </blockquote>
          ) : null}
        </div>
      </div>
    </div>
  );
}
