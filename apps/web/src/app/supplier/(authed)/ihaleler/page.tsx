import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { FileText } from "lucide-react";

export const metadata = {
  title: "İhaleler",
};

export default function SupplierIhalelerPage() {
  return (
    <PlaceholderPage
      icon={FileText}
      title="İhaleler"
      subtitle="Bağlı olduğunuz alıcıların ihaleleri burada listelenecek."
      description="Davet edildiğiniz tüm ihaleleri tek yerden görün, koşulları inceleyin ve teklif gönderin."
      highlights={[
        "İngiliz usulü açık eksiltme",
        "RFQ (kapalı teklif) desteği",
        "Teklif revize etme ve sıralama bildirimi",
        "İhale durumu takibi (açık / kapanıyor / kapandı)",
      ]}
      backHref="/supplier/dashboard"
      backLabel="Ana sayfaya dön"
    />
  );
}
