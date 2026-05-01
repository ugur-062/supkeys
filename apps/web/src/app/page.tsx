import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <SupkeysLogo variant="full" size="md" priority />
          <nav className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary">
              Giriş Yap
            </Link>
            <Link href="/demo-talep" className="btn-primary">
              Demo Talep Et
            </Link>
          </nav>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-8 py-20">
        <div className="max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            AI Destekli e-Satın Alma
          </div>
          <h1 className="font-display font-bold text-5xl md:text-6xl text-brand-900 leading-tight">
            Satın almayı <span className="text-brand-600">akıllı</span> hale getirin.
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Tedarikçi yönetimi, e-ihale ve teklif toplama süreçlerinizi tek platformdan
            yönetin. Şeffaf, denetlenebilir, AI destekli.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link href="/demo-talep" className="btn-primary text-base px-6 py-3">
              Demo Talep Et
            </Link>
            <Link href="/login" className="btn-secondary text-base px-6 py-3">
              Giriş Yap
            </Link>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm text-slate-500">Tedarikçi misiniz?</p>
            <Link
              href="/register/supplier"
              className="text-brand-600 hover:text-brand-700 font-semibold underline-offset-4 hover:underline"
            >
              Tedarikçi Olarak Kayıt Ol
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
          <span>© 2026 Supkeys</span>
          <span>v0.0.1 — geliştirme</span>
        </div>
      </footer>
    </main>
  );
}
