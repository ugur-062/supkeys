import { LegalDoc } from "@/components/marketing/legal-doc";

export const metadata = { title: "KVKK Aydınlatma Metni — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="KVKK Aydınlatma Metni"
      paragraphs={[
        "Bu Aydınlatma Metni (placeholder), 6698 sayılı KVKK kapsamında kişisel verilerinizin işlenmesine ilişkin bilgilendirmedir.",
        "Kişisel verileriniz; hesap oluşturma, doğrulama, hizmet sunumu ve yasal yükümlülükler için işlenir.",
        "Hizmet sağlayıcılar (yurt dışı dahil): Supabase (kimlik/veritabanı), Vercel (barındırma), Resend (e-posta), Upstash, Sentry. Bu sağlayıcılara veri aktarımı olabilir.",
        "KVKK md. 11 kapsamındaki haklarınızı kullanmak için bizimle iletişime geçebilirsiniz.",
      ]}
    />
  );
}
