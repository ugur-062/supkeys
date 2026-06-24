"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useAdminThread } from "@/hooks/use-admin-messages";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const CONTEXT_LABEL: Record<string, string> = {
  TENDER: "İhale",
  ORDER: "Sipariş",
  DIRECT: "Genel",
};

function ThreadDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const query = useAdminThread(id);

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-4 max-w-[800px]">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const t = query.data;

  return (
    <div className="space-y-5 max-w-[800px]">
      <Link
        href="/admin/messages"
        className="text-sm text-admin-text-muted hover:text-brand-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Tüm Konuşmalar
      </Link>

      <h1 className="text-xl font-display font-bold text-admin-text">
        {t.tenant.name} <span className="text-admin-text-muted">↔</span>{" "}
        {t.supplier.companyName}
      </h1>

      <div className="admin-card p-4 space-y-3">
        {t.messages.length === 0 ? (
          <p className="text-sm text-admin-text-muted text-center py-6">
            Mesaj yok
          </p>
        ) : (
          t.messages.map((m) => {
            const isTenant = m.senderType === "TENANT_USER";
            return (
              <div
                key={m.id}
                className={cn("flex", isTenant ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    isTenant
                      ? "bg-zinc-100 text-admin-text"
                      : "bg-brand-600 text-white",
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold opacity-90">
                      {m.senderName}
                    </span>
                    <span className="text-[10px] opacity-70">
                      {isTenant ? "Alıcı" : "Tedarikçi"}
                    </span>
                    {m.context && m.context !== "DIRECT" ? (
                      <Badge color={isTenant ? "zinc" : "blue"}>
                        {CONTEXT_LABEL[m.context] ?? m.context}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] opacity-70 mt-1 text-right">
                    {format(new Date(m.sentAt), "d MMM HH:mm", { locale: tr })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AdminThreadPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <ThreadDetail />
      </AdminShell>
    </RequireAdminAuth>
  );
}
