import { PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ_FLAT, FAQ_GROUPS } from "./faq-data";
import { breadcrumbNode, faqNode, graph } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * SIK SORULAN SORULAR (2026-09-09, Parça 4: GEO).
 *
 * Üretken arama motorları bir cevabı HAZIR ve KAYNAKLANABİLİR bulduğunda o
 * sayfayı alıntılar. "Rothern'de teklifler gizli mi?" sorusunun cevabı
 * platformun içinde dağınık duruyordu; burada tek yerde, tam cümlelerle ve
 * `FAQPage` işaretlemesiyle duruyor.
 *
 * Soru-cevaplar `faq-data.ts`ten gelir — sayfa ve şema AYNI diziden beslenir.
 */
export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: "Sık sorulan sorular",
  description:
    "Rothern nasıl çalışır: kapalı zarf teklif, alıcı kimliğinin gizliliği, ücretsiz vitrin ve paketler, doğrulama, kategori ağacı ve kullanıcı yetkileri hakkında sık sorulan sorular.",
  path: "/sss",
});

export default function Page() {
  return (
    <PublicLayout>
      <JsonLd
        data={graph([
          faqNode(FAQ_FLAT.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbNode([
            { name: "Anasayfa", path: "/" },
            { name: "Sık sorulan sorular", path: "/sss" },
          ]),
        ])}
      />
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="text-2xl font-bold text-zinc-900">Sık sorulan sorular</h1>
        <p className="mt-2 text-sm/6 text-zinc-600">
          Rothern&apos;in nasıl çalıştığına dair en çok sorulanlar. Süreçlerin
          ayrıntısı{" "}
          <Link href="/nasil-calisir" className="underline hover:text-zinc-900">
            Nasıl Çalışır
          </Link>{" "}
          sayfasında; paketler ve fiyatlar{" "}
          <Link href="/nasil-calisir#fiyatlar" className="underline hover:text-zinc-900">
            fiyat bölümünde
          </Link>
          .
        </p>

        {FAQ_GROUPS.map((group) => (
          <section key={group.heading} className="mt-10">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
              {group.heading}
            </h2>
            <dl className="mt-4 divide-y divide-zinc-950/5 border-y border-zinc-950/5">
              {group.items.map((item) => (
                <div key={item.q} className="py-5">
                  <dt className="text-base font-semibold text-zinc-950">{item.q}</dt>
                  <dd className="mt-2 text-sm/6 text-zinc-600">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="mt-10 text-sm/6 text-zinc-600">
          Cevabını bulamadınız mı?{" "}
          <Link href="/iletisim" className="underline hover:text-zinc-900">
            İletişim sayfasından
          </Link>{" "}
          yazabilirsiniz.
        </p>
      </div>
    </PublicLayout>
  );
}
