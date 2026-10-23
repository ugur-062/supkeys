"use client";

import { localizePath } from "@/i18n/href";
import type { Locale } from "@rothern/i18n";
import { Copy, Linkedin, Mail, MessageCircle, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

/**
 * TALEBİ PAYLAŞ (2026-09-27, Faz 3 organik büyüme): herkese açık talep
 * sayfasının bağlantısı LinkedIn / WhatsApp / e-posta ile paylaşılır ya da
 * kopyalanır. YALNIZ talep vitrindeyse çizilir (`publicPath` API'den; vitrinde
 * değilse null — 404 veren bağlantı paylaştırılmaz). Sayfanın OG kartı hazır.
 */
export function ShareListing({ publicPath, title, compact = false }: { publicPath: string | null | undefined; title: string; compact?: boolean }) {
  const t = useTranslations("web.panel.requests.share");
  const locale = useLocale() as Locale;
  if (!publicPath) return null;
  const url = typeof window !== "undefined" ? `${window.location.origin}${localizePath(publicPath, locale)}` : "";
  const text = t("text", { title });
  const links = [
    { key: "linkedin", Icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { key: "whatsapp", Icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    {
      key: "email",
      Icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(t("emailSubject", { title }))}&body=${encodeURIComponent(`${text}\n${url}`)}`,
    },
  ] as const;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      // Pano izni yok / desteklenmiyor — sessiz kalmak tıklamayı boşa
      // düşürüyordu (arayüz testi D-253).
      toast.error(t("copyFailed"));
    }
  };
  return (
    <section className={compact ? "" : "rounded-2xl border border-zinc-200 bg-white p-4 text-left"} aria-label={t("title")}>
      {compact ? null : (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Share2 className="h-4 w-4 text-blue-600" aria-hidden />
            {t("title")}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">{t("lead")}</p>
        </>
      )}
      <div className={`${compact ? "" : "mt-3 "}flex flex-wrap gap-2`}>
        {links.map(({ key, Icon, href }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {t(key)}
          </a>
        ))}
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {t("copy")}
        </button>
      </div>
    </section>
  );
}
