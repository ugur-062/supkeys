import { LegalDoc } from "@/components/marketing/legal-doc";

export const metadata = { title: "Kullanıcı Sözleşmesi — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Kullanıcı Sözleşmesi"
      paragraphs={[
        "Bu Kullanıcı Sözleşmesi (placeholder), Rothern platformunu kullanan gerçek/tüzel kişilerin hak ve yükümlülüklerini düzenler. Nihai hukuki metin yayımlandığında bu bölüm güncellenecektir.",
        "Kullanıcı, platformu yürürlükteki mevzuata ve iyi niyet kurallarına uygun kullanmayı kabul eder.",
        "Hesap güvenliğinden ve hesabı üzerinden yapılan işlemlerden kullanıcı sorumludur.",
      ]}
    />
  );
}
