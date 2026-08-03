"use client";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
  type NotificationPortal,
} from "@/hooks/use-notifications";
import { EmptyState, ListSkeleton } from "@/components/list";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Panel rozeti — birleşik listede bildirim hangi şapkayla ilgili? */
const PORTAL_CHIP: Record<NotificationPortal, { label: string; cls: string }> = {
  satinalma: { label: "Satınalma", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "Satış", cls: "bg-emerald-50 text-emerald-700" },
};

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "satinalma", label: "Satınalma" },
  { key: "satis", label: "Satış" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BildirimlerPage() {
  // TEK kutu (kullanıcı isteği): iki panelin bildirimleri birlikte gelir;
  // filtre yalnız görünümü daraltır (portal'sız + null-portallı ortaklar
  // her filtrede görünür).
  const { data: allItems = [], isLoading } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>("all");
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Bildirimler</h1>
          <p className="text-sm text-zinc-500">
            İhale davetleri, kategori eşleşmeleri, sipariş ve onay güncellemeleri.
          </p>
        </div>
        {hasUnread ? (
          <button
            type="button"
            onClick={() => markAll.mutate(undefined)}
            disabled={markAll.isPending}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 disabled:opacity-50"
          >
            Tümünü okundu işaretle
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
            {f.label}
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
            title="Henüz bildiriminiz yok"
            description="İhale davetleri, kategori eşleşmeleri, sipariş ve onay güncellemeleri burada birikir."
            action={
              <Link
                href="/company/ayarlar/bildirimler"
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Bildirim Tercihlerine Git
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
                      {PORTAL_CHIP[n.portal].label}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-zinc-400">
                    {formatDate(n.createdAt)}
                  </span>
                </div>
                <span className="text-sm text-zinc-600">{n.body}</span>
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
