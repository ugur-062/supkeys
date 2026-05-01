import { SupplierRegisterForm } from "./_components/supplier-register-form";

export const metadata = {
  title: "Tedarikçi Olarak Kayıt Ol — Supkeys",
};

interface SupplierRegisterPageProps {
  searchParams: Promise<{ invitation?: string }>;
}

export default async function SupplierRegisterPage({
  searchParams,
}: SupplierRegisterPageProps) {
  const { invitation } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Tedarikçi olarak kayıt ol
        </h1>
        <p className="text-slate-600 text-sm">
          Supkeys'i kullanan firmaların ihalelerine katılın, fırsatları
          kaçırmayın.
        </p>
      </div>

      <SupplierRegisterForm invitationToken={invitation} />
    </div>
  );
}
