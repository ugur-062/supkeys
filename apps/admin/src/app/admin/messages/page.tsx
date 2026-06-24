"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, Pagination, SearchInput } from "@/components/list";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useAdminThreads } from "@/hooks/use-admin-messages";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
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
      <PageHeader
        title="Mesajlar"
        description="Alıcı ↔ tedarikçi konuşmaları (salt-okunur, uyuşmazlık çözümü için)."
      />

      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Alıcı / tedarikçi ara..."
      />

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

      {pagination ? (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
          variant="bare"
        />
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
