import { AdminLogo } from "@/components/brand/admin-logo";
import { AdminLoginForm } from "./login-form";

export const metadata = {
  title: "Admin Giriş — Supkeys",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen flex flex-col bg-admin-bg">
      <section className="flex-1 px-4 py-12 md:py-16 flex items-start md:items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="flex justify-center mb-8">
            <AdminLogo variant="dark" badge />
          </div>

          <div className="text-center mb-8 space-y-2">
            <h1 className="font-display font-bold text-3xl text-admin-text">
              Platform Admin Girişi
            </h1>
            <p className="text-admin-text-muted text-sm">
              Supkeys yönetim paneline erişmek için giriş yapın.
            </p>
          </div>

          <AdminLoginForm />
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-admin-border bg-admin-surface">
        <div className="max-w-7xl mx-auto text-sm text-admin-text-muted text-center">
          © 2026 Supkeys
        </div>
      </footer>
    </main>
  );
}
