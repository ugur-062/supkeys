import { LegalDoc } from "@/components/marketing/legal-doc";

export const metadata = { title: "Aracılık ve Kullanım Sözleşmesi — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Platform Aracılık ve Kullanım Sözleşmesi"
      paragraphs={[
        "Bu sözleşme (placeholder), Rothern'in alıcı ve satıcılar arasında sağladığı aracılık hizmetinin kapsamını ve koşullarını düzenler.",
        "Rothern, taraflar arasındaki ihale/teklif/sipariş süreçlerine aracılık eder; sözleşmenin tarafı değildir.",
        "Ücretlendirme ve premium üyelik koşulları ayrıca bildirilir.",
      ]}
    />
  );
}
