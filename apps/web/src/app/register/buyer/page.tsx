import { redirect } from "next/navigation";
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

  // Alıcılar sadece demo görüşmesi sonrası admin daveti ile kayıt olabilir.
  // Davet token'ı yoksa demo talep akışına yönlendir.
  if (!invitation) {
    redirect("/demo-talep");
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Alıcı olarak kayıt ol
        </h1>
        <p className="text-slate-600 text-sm">
          Davet bağlantınızla hesabınızı oluşturun.
        </p>
      </div>

      <BuyerRegisterForm invitationToken={invitation} />
    </div>
  );
}
