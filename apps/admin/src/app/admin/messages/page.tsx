"use client";

import { Input } from "@/components/catalyst/input";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import { useAdminThreads } from "@/hooks/use-admin-messages";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function MessagesView() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useAdminThreads({ search: search.trim() || undefined, page });
  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-zinc-100 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-admin-text">
            Mesajlar
          </h1>
          <p className="text-sm text-admin-text-muted">
            Alıcı ↔ tedarikçi konuşmaları (salt-okunur, uyuşmazlık çözümü için).
          </p>
        </div>
      </div>

      <div className="w-64">
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Alıcı / tedarikçi ara..."
        />
      </div>

      <div className="admin-card divide-y divide-surface-border">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-admin-text-muted">
            {query.isLoading ? "Yükleniyor..." : "Konuşma bulunamadı"}
          </p>
        ) : (
          items.map((t) => (
            <Link
              key={t.id}
              href={`/admin/messages/${t.id}`}
              className="block px-5 py-3 hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-admin-text truncate">
                  {t.tenant.name}{" "}
                  <span className="text-admin-text-muted font-normal">↔</span>{" "}
                  {t.supplier.companyName}
                </p>
                <span className="text-xs text-admin-text-muted flex-shrink-0">
                  {t.lastMessageAt
                    ? formatDistanceToNow(new Date(t.lastMessageAt), {
                        addSuffix: true,
                        locale: tr,
                      })
                    : "—"}{" "}
                  · {t.messageCount} mesaj
                </span>
              </div>
              {t.lastMessage ? (
                <p className="text-xs text-admin-text-muted mt-1 truncate">
                  <span className="font-medium">
                    {t.lastMessage.senderType === "TENANT_USER" ? "Alıcı" : "Tedarikçi"}:
                  </span>{" "}
                  {t.lastMessage.preview}
                </p>
              ) : null}
            </Link>
          ))
        )}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-admin-text-muted">
            {pagination.total} konuşma · Sayfa {pagination.page}/{pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Önceki
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
              Sonraki
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <MessagesView />
      </AdminShell>
    </RequireAdminAuth>
  );
}
