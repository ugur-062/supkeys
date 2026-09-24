"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
  type NotificationPortal,
} from "@/hooks/use-notifications";
import { EmptyState, ListSkeleton } from "@/components/list";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

/** Panel rozeti — birleşik listede bildirim hangi şapkayla ilgili? Etiket katalog anahtarı (`web.panel.inbox.bildirimlerPage.*`). */
const PORTAL_CHIP: Record<NotificationPortal, { label: "satinalma" | "satis"; cls: string }> = {
  satinalma: { label: "satinalma", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "satis", cls: "bg-emerald-50 text-emerald-700" },
};

const FILTERS = [
  { key: "all", label: "tumu" },
  { key: "satinalma", label: "satinalma" },
  { key: "satis", label: "satis" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];



export default function BildirimlerPage() {
  const t = useTranslations("web.panel.inbox.bildirimlerPage");
  const locale = useLocale();
  // TEK kutu (kullanıcı isteği): iki panelin bildirimleri birlikte gelir;
  // filtre yalnız görünümü daraltır (portal'sız + null-portallı ortaklar
  // her filtrede görünür).
  const { data: allItems = [], isLoading } = useNotifications();
  // C60: filtre URL'de (?tab=) — yenileme/paylaşımda korunur.
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [filter, setFilterState] = useState<FilterKey>(
    urlTab === "satinalma" || urlTab === "satis" ? urlTab : "all",
  );
  const setFilter = (k: FilterKey) => {
    setFilterState(k);
    const u = new URL(window.location.href);
    if (k === "all") u.searchParams.delete("tab");
    else u.searchParams.set("tab", k);
    window.history.replaceState(null, "", u.toString());
  };
  const items =
    filter === "all"
      ? allItems
      : allItems.filter((n) => !n.portal || n.portal === filter);
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const router = useRouter();
  const hasUnread = allItems.some((n) => !n.readAt);

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.ctaUrl) {
      const path = n.ctaUrl.replace(/^https?:\/\/[^/]+/, "");
      router.push(path || "/company");
    }
  };

  // C34: veri/list sayfaları tam genişlik (PageContainer kuralı) — dar
  // ortalanmış kutu yalnız Ayarlar'da.
  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{t("bildirimler")}</h1>
          <p className="text-sm text-zinc-500">
            {t("satinAlmaTalebiDavetleriKategori")}
          </p>
        </div>
        {hasUnread ? (
          <button
            type="button"
            onClick={() => markAll.mutate(undefined)}
            disabled={markAll.isPending}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 disabled:opacity-50"
          >
            {t("tumunuOkunduIsaretle")}
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 sm:w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              filter === f.key
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="overflow-hidden card">
          <ListSkeleton rows={6} />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bell}
            title={t("henuzBildiriminizYok")}
            description={t("satinAlmaTalebiDavetleriKategori2")}
            action={
              <Link
                href="/company/ayarlar/bildirimler"
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                {t("bildirimTercihlerineGit")}
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="overflow-hidden card">
          {items.map((n) => (
            <li key={n.id} className="border-b border-zinc-50 last:border-0">
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full flex-col gap-1 px-5 py-4 text-left transition hover:bg-zinc-50 ${
                  n.readAt ? "" : "bg-blue-50/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {!n.readAt ? (
                    <span
                      className="size-2 shrink-0 rounded-full bg-blue-500"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="text-sm font-semibold text-zinc-900">
                    {n.title}
                  </span>
                  {n.portal ? (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${PORTAL_CHIP[n.portal].cls}`}
                    >
                      {t(PORTAL_CHIP[n.portal].label)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-zinc-400">
                    {formatDate(n.createdAt, "datetime", locale)}
                  </span>
                </div>
                <span
                  className={n.readAt ? "text-sm text-zinc-600" : "text-sm font-medium text-zinc-800"}
                  title={n.body}
                >
                  {n.body}
                </span>
                {n.ctaLabel ? (
                  <span className="mt-0.5 text-xs font-medium text-blue-600">
                    {n.ctaLabel} →
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
