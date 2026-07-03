"use client";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
} from "@/hooks/use-notifications";
import { EmptyState, ListSkeleton } from "@/components/list";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BildirimlerPage() {
  const { data: items = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const router = useRouter();
  const hasUnread = items.some((n) => !n.readAt);

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
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 disabled:opacity-50"
          >
            Tümünü okundu işaretle
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white shadow-sm">
          <ListSkeleton rows={6} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-zinc-100 bg-white">
          <EmptyState
            icon={Bell}
            title="Henüz bildiriminiz yok"
            description="İhale davetleri, kategori eşleşmeleri, sipariş ve onay güncellemeleri burada birikir."
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white shadow-sm">
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
