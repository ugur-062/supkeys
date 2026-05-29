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
      <header className="bg-white border-b border-surface-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="Supkeys">
            <SupkeysLogo variant="full" size="sm" />
          </Link>
          <Link
            href="/login"
            className="text-sm text-brand-700 hover:underline font-medium"
          >
            Giriş Yap
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-surface-border py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-6 text-center text-xs text-slate-500">
          © 2026 Supkeys · Tedarikçi profil özelliği PREMIUM üyelere özeldir
        </div>
      </footer>
    </div>
  );
}
