import { ResetCallbackForm } from "./reset-callback-form";

export const metadata = {
  title: "Yeni Şifre Belirle — Supkeys",
};

/**
 * Supabase Auth password recovery linkinden gelen kullanıcıyı karşılar.
 * URL hash'inde access_token + refresh_token + type=recovery gelir;
 * client component bunları okur ve yeni şifre formunu gösterir.
 */
export default function ResetCallbackPage() {
  return <ResetCallbackForm />;
}
