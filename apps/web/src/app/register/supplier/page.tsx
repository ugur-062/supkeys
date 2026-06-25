import { fetchPublicTenant } from "@/lib/public/fetch-tenant";
import { SupplierRegisterForm } from "./_components/supplier-register-form";

export const metadata = {
  title: "Tedarikçi Olarak Kayıt Ol — Rothern",
};

interface SupplierRegisterPageProps {
  searchParams: Promise<{ invitation?: string; connect?: string }>;
}

export default async function SupplierRegisterPage({
  searchParams,
}: SupplierRegisterPageProps) {
  const { invitation, connect } = await searchParams;

  // "Tedarikçi Ol" — hedef alıcının adını göstermek için public profili çek.
  const connectTenant =
    connect && !invitation ? await fetchPublicTenant(connect) : null;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Tedarikçi olarak kayıt ol
        </h1>
        <p className="text-slate-600 text-sm">
          Rothern'i kullanan firmaların ihalelerine katılın, fırsatları
          kaçırmayın.
        </p>
      </div>

      <SupplierRegisterForm
        invitationToken={invitation}
        connectSlug={connectTenant ? connect : undefined}
        connectTenantName={connectTenant?.name}
      />
    </div>
  );
}
