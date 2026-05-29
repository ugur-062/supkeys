import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Public tedarikçi profil sayfası layout'u.
 * Auth yok, sidebar yok — sade marka header + footer.
 */
export default function PublicSupplierLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-subtle">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-surface-border shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Supkeys"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
          >
            <SupkeysLogo variant="full" size="lg" priority />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border bg-white text-sm font-semibold text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition-colors"
          >
            Giriş Yap
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-surface-border py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <SupkeysLogo variant="full" size="sm" />
            <span>© 2026</span>
          </div>
          <span>Tedarikçi profil özelliği PREMIUM üyelere özeldir</span>
        </div>
      </footer>
    </div>
  );
}
