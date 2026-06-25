import { RothernLogo } from "@/components/brand/logo";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-zinc-800 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <RothernLogo variant="full" size="md" priority />
          <nav className="flex items-center gap-3">
            <Link href="/company/login" className="btn-secondary">
              Giriş Yap
            </Link>
            <Link href="/company/kayit" className="btn-primary">
              Kaydol
            </Link>
          </nav>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-8 py-20">
        <div className="max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            AI Destekli B2B Ticaret
          </div>
          <h1 className="font-display font-bold text-5xl md:text-6xl text-brand-900 leading-tight">
            Hem al, hem sat — <span className="text-brand-600">tek</span>{" "}
            platformdan.
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Alım ilanı aç, teklif topla; ya da fazlanı sat. Firmalarla bağlan,
            ihale yönet, sipariş takip et. Şeffaf, denetlenebilir, AI destekli.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link href="/company/kayit" className="btn-primary text-base px-6 py-3">
              Kaydol
            </Link>
            <Link
              href="/company/login"
              className="btn-secondary text-base px-6 py-3"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-slate-500">
          <span>© 2026 Rothern</span>
          <span>v0.0.1 — geliştirme</span>
        </div>
      </footer>
    </main>
  );
}
