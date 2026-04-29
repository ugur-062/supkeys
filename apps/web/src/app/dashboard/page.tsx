"use client";

import { SupkeysLogo } from "@/components/brand/logo";
import { RequireAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import { useAuth, useLogout, useMe } from "@/hooks/use-auth";
import { Building2, LogOut, User } from "lucide-react";

function DashboardContent() {
  const { user } = useAuth();
  const logout = useLogout();
  const meQuery = useMe(); // /auth/me ile token doğrulama

  return (
    <main className="min-h-screen">
      <header className="px-8 py-4 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <SupkeysLogo />
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-700 hidden md:block">
              <span className="text-slate-500">Merhaba,</span>{" "}
              <span className="font-medium">
                {user?.firstName} {user?.lastName}
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" />
              Çıkış
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-8 py-10">
        <div className="space-y-2 mb-8">
          <h1 className="font-display font-bold text-3xl text-brand-900">
            Hoş geldin, {user?.firstName} 👋
          </h1>
          <p className="text-slate-600">
            Supkeys panelin hazırlanıyor. Yakında ihalelerini, tedarikçilerini
            ve tasarruflarını burada göreceksin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="font-display font-bold text-lg text-brand-900">
                Firma
              </h3>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Ad</dt>
                <dd className="text-brand-900 font-medium">
                  {user?.tenant.name}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Slug</dt>
                <dd className="text-brand-900 font-mono text-xs">
                  {user?.tenant.slug}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <User className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="font-display font-bold text-lg text-brand-900">
                Hesap
              </h3>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">E-posta</dt>
                <dd className="text-brand-900">{user?.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Rol</dt>
                <dd className="text-brand-900 font-medium">{user?.role}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-10 p-4 rounded-lg bg-brand-50 border border-brand-100 text-sm text-brand-800">
          🔐 <strong>Token doğrulandı:</strong>{" "}
          {meQuery.isLoading
            ? "Kontrol ediliyor..."
            : meQuery.isError
              ? "Token geçersiz"
              : "API ile bağlantı sağlıklı."}
        </div>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
