import { PublicLayout } from "@/components/marketplace/public-layout";
import { OPERATOR } from "@/lib/company-info";
import { buildMetadata } from "@/lib/seo/meta";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbNode, graph } from "@/lib/seo/jsonld";
import Link from "next/link";

/* Başlıkta "— Rothern" YOK: şablon (`%s · Rothern`) markayı zaten ekliyor —
   canlıda "İletişim ve Künye — Rothern · Rothern" çıkıyordu (2026-09-09). */
export const metadata = buildMetadata({
  title: "İletişim ve Künye",
  description:
    "Rothern'i işleten şirketin ticari unvanı, adresi, vergi bilgileri ve iletişim adresleri; destek ve KVKK başvuruları için e-posta.",
  path: "/iletisim",
});

const rows: Array<{ label: string; value: string }> = [
  { label: "Ticari Unvan", value: OPERATOR.legalName },
  { label: "Marka", value: OPERATOR.brand },
  { label: "Adres", value: OPERATOR.address },
  { label: "Vergi Dairesi", value: OPERATOR.taxOffice },
  { label: "Vergi Numarası", value: OPERATOR.taxNo },
  { label: "E-posta (destek)", value: OPERATOR.supportEmail },
  { label: "E-posta (KVKK başvuruları)", value: OPERATOR.kvkkEmail },
  { label: "Web", value: OPERATOR.website },
];

export default function Page() {
  return (
    <PublicLayout>
    <JsonLd
      data={graph([
        breadcrumbNode([
          { name: "Anasayfa", path: "/" },
          { name: "İletişim ve Künye", path: "/iletisim" },
        ]),
      ])}
    />
    <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
      <h1 className="text-2xl font-bold text-zinc-900">
        İletişim ve Künye
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Rothern, {OPERATOR.legalName} tarafından işletilen B2B tedarik
        platformudur. Sorularınız için{" "}
        <a
          href={`mailto:${OPERATOR.supportEmail}`}
          className="underline hover:text-zinc-900"
        >
          {OPERATOR.supportEmail}
        </a>{" "}
        adresine yazabilirsiniz; kişisel verilerinize ilişkin başvurular için{" "}
        <a
          href={`mailto:${OPERATOR.kvkkEmail}`}
          className="underline hover:text-zinc-900"
        >
          {OPERATOR.kvkkEmail}
        </a>{" "}
        adresi kullanılır.
      </p>
      <h2 className="mt-10 text-base font-semibold text-zinc-950">
        Hangi konuda nereye yazmalı
      </h2>
      <dl className="mt-3 space-y-4 text-sm/6 text-zinc-700">
        <div>
          <dt className="font-semibold text-zinc-950">Hesap, üyelik ve teknik destek</dt>
          <dd className="mt-1">
            <a href={`mailto:${OPERATOR.supportEmail}`} className="underline hover:text-zinc-900">
              {OPERATOR.supportEmail}
            </a>{" "}
            — giriş sorunları, firma doğrulaması, paket ve koltuk soruları,
            ürün yayımlama ve talep akışıyla ilgili her şey. Yazarken firma
            adınızı ve varsa ilgili talep/ürün adresini eklemeniz süreci
            kısaltır.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-950">Kişisel verilere ilişkin başvurular</dt>
          <dd className="mt-1">
            <a href={`mailto:${OPERATOR.kvkkEmail}`} className="underline hover:text-zinc-900">
              {OPERATOR.kvkkEmail}
            </a>{" "}
            — KVKK kapsamındaki bilgi edinme, düzeltme ve silme talepleri. Bu
            adres yalnız veri başvuruları içindir; destek soruları için
            yukarıdaki adresi kullanın.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-950">
            İçerik bildirimi ve kural ihlali
          </dt>
          <dd className="mt-1">
            Yanıltıcı ürün bilgisi, size ait olduğunu düşündüğünüz bir görsel
            ya da kötüye kullanım gördüğünüzde{" "}
            <a href={`mailto:${OPERATOR.supportEmail}`} className="underline hover:text-zinc-900">
              {OPERATOR.supportEmail}
            </a>{" "}
            adresine ilgili sayfanın adresiyle birlikte yazın. Firmalar arası
            ticari uyuşmazlıklara Rothern taraf değildir — platform mal ve
            hizmet bedeline aracılık etmez.
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-base font-semibold text-zinc-950">Künye</h2>
      <dl className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-3 sm:gap-4"
          >
            <dt className="text-sm font-medium text-zinc-500">{r.label}</dt>
            <dd className="text-sm text-zinc-900 sm:col-span-2">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm/6 text-zinc-600">
        Rothern&apos;in nasıl çalıştığına dair sorular için{" "}
        <Link href="/sss" className="underline hover:text-zinc-900">
          sık sorulan sorular
        </Link>{" "}
        sayfası, sözleşme metinleri için{" "}
        <Link href="/sozlesmeler/kullanici" className="underline hover:text-zinc-900">
          Kullanıcı Sözleşmesi
        </Link>{" "}
        ve{" "}
        <Link href="/sozlesmeler/kvkk" className="underline hover:text-zinc-900">
          KVKK aydınlatma metni
        </Link>
        .
      </p>
    </div>
    </PublicLayout>
  );
}
