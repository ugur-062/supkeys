"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { useAdminAuth, useAdminMe } from "@/hooks/use-admin-auth";
import { Activity, Building2, Inbox } from "lucide-react";

const PLACEHOLDER_CARDS = [
  {
    title: "Bekleyen Demo Talepleri",
    description: "Yeni demo başvurularını burada listeleyeceğiz.",
    icon: Inbox,
  },
  {
    title: "Aktif Tenant",
    description: "Sisteme kayıtlı müşteri firma sayısı ve durum özeti.",
    icon: Building2,
  },
  {
    title: "Sistem Durumu",
    description: "API, kuyruklar ve agent altyapısı sağlık göstergeleri.",
    icon: Activity,
  },
];

function DashboardContent() {
  const { admin } = useAdminAuth();
  const meQuery = useAdminMe();

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="space-y-1">
        <h1 className="font-display font-bold text-3xl text-admin-text">
          Hoş geldin, {admin?.firstName}
        </h1>
        <p className="text-admin-text-muted">
          Supkeys platform yönetim paneli. Modüller bu sprint içinde aktif olacak.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLACEHOLDER_CARDS.map(({ title, description, icon: Icon }) => (
          <div key={title} className="admin-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand-600" />
              </div>
              <span className="text-[10px] uppercase tracking-wide text-admin-text-muted bg-surface-muted px-2 py-1 rounded">
                Yakında
              </span>
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-admin-text">
                {title}
              </h3>
              <p className="text-sm text-admin-text-muted mt-1">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div
        className={`p-4 rounded-lg border text-sm ${
          meQuery.isError
            ? "bg-danger-50 border-danger-500/30 text-danger-700"
            : "bg-brand-50 border-brand-100 text-brand-800"
        }`}
      >
        {meQuery.isLoading ? (
          <span>🔐 Token doğrulanıyor…</span>
        ) : meQuery.isError ? (
          <span>
            ⚠️ <strong>Token geçersiz.</strong> Tekrar giriş yapmanız gerekecek.
          </span>
        ) : (
          <span>
            🔐 <strong>Token doğrulandı:</strong> API ile bağlantı sağlıklı.
            Oturum açan: <strong>{meQuery.data?.email}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <DashboardContent />
      </AdminShell>
    </RequireAdminAuth>
  );
}
