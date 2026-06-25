import { VerifyCallbackForm } from "./verify-callback-form";

export const metadata = {
  title: "E-posta Doğrulama — Rothern",
};

/**
 * Supabase Auth e-posta doğrulama linkinden gelen kullanıcıyı karşılar.
 * URL hash'inde access_token + type=signup veya type=invite gelir;
 * client component bunları okur, gerekirse domain tarafına ping atar.
 */
export default function VerifyCallbackPage() {
  return <VerifyCallbackForm />;
}
