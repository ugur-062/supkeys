import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";

export const metadata = {
  title: "Kayıt Ol — Supkeys",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col bg-surface-subtle">
      <header className="px-4 md:px-8 py-5 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <SupkeysLogo variant="full" size="md" priority />
          </Link>
          <p className="text-sm text-slate-600">
            Zaten hesabın var mı?{" "}
            <Link
              href="/login"
              className="text-brand-700 hover:text-brand-800 font-semibold hover:underline"
            >
              Giriş Yap
            </Link>
          </p>
        </div>
      </header>

      <section className="flex-1 px-4 py-6 md:py-10">
        <div className="max-w-2xl mx-auto w-full">{children}</div>
      </section>

      <footer className="px-4 md:px-8 py-5 border-t border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>© 2026 Supkeys</span>
          <div className="flex items-center gap-4">
            <Link href="#kvkk" className="hover:text-brand-700 hover:underline">
              KVKK
            </Link>
            <Link href="#tos" className="hover:text-brand-700 hover:underline">
              Hizmet Şartları
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
