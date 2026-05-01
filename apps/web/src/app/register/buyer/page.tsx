import { BuyerRegisterForm } from "./_components/buyer-register-form";

export const metadata = {
  title: "Alıcı Olarak Kayıt Ol — Supkeys",
};

interface BuyerRegisterPageProps {
  searchParams: Promise<{ invitation?: string }>;
}

export default async function BuyerRegisterPage({
  searchParams,
}: BuyerRegisterPageProps) {
  const { invitation } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Alıcı olarak kayıt ol
        </h1>
        <p className="text-slate-600 text-sm">
          Tedarikçilerinizi tek bir platformdan yönetin.
        </p>
      </div>

      <BuyerRegisterForm invitationToken={invitation} />
    </div>
  );
}
