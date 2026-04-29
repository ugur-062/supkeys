import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";
import { DemoForm } from "./demo-form";

export const metadata = {
  title: "Demo Talep — Supkeys",
  description: "Supkeys'i ücretsiz keşfetmek için demo talep edin.",
};

export default function DemoTalepPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <SupkeysLogo />
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-brand-700">
            ← Ana Sayfa
          </Link>
        </div>
      </header>

      <section className="flex-1 px-4 py-12 md:py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              30 dakikalık birebir demo
            </div>
            <h1 className="font-display font-bold text-3xl md:text-4xl text-brand-900 leading-tight">
              Supkeys'i ekibinize uyarlayalım
            </h1>
            <p className="text-slate-600 max-w-xl mx-auto">
              Formu doldurun, satış ekibimiz 1 iş günü içinde dönüş yapsın. Tedarikçi
              yönetimi, ihale ve teklif toplama akışlarınızı birlikte değerlendirelim.
            </p>
          </div>

          <DemoForm />
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-surface-border bg-white">
        <div className="max-w-7xl mx-auto text-sm text-slate-500 text-center">
          © 2026 Supkeys
        </div>
      </footer>
    </main>
  );
}
