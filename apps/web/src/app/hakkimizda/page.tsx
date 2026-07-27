import { OPERATOR } from "@/lib/company-info";
import Link from "next/link";

export const metadata = { title: "Hakkımızda — Rothern" };

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Ana sayfa
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Hakkımızda</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-700">
        <p>
          <strong>Rothern</strong>, alıcı ve tedarikçileri tek platformda
          buluşturan, yapay zekâ destekli bir B2B e-tedarik ve e-ihale
          platformudur. Firmalar Rothern üzerinde ihale (RFQ) açar, kapalı zarf
          usulüyle teklif toplar, canlı pazarlık (açık eksiltme) yürütür,
          kazandırma yapar ve sipariş sürecini teslimata kadar tek panelden
          takip eder.
        </p>
        <p>
          Tek firma hesabı hem alış hem satış yapar; 13.000+ UNSPSC kategorisi
          üzerinden hassas alıcı-tedarikçi eşleşmesi sağlanır. Kapalı zarf
          gizliliği platformun temel ilkesidir: tedarikçiler birbirinin
          teklifini asla göremez.
        </p>
        <p>
          Rothern üzerinden satılan tek şey üyelik paketleridir; firmalar
          arasındaki mal/hizmet bedeline platform aracılık etmez — ticaret,
          taraflar arasında doğrudan yürür.
        </p>
        <p>
          Platform, <strong>{OPERATOR.legalName}</strong> tarafından
          işletilmektedir ({OPERATOR.address} · {OPERATOR.taxOffice} — Vergi No:{" "}
          {OPERATOR.taxNo}). Bize{" "}
          <a
            href={`mailto:${OPERATOR.supportEmail}`}
            className="underline hover:text-zinc-900"
          >
            {OPERATOR.supportEmail}
          </a>{" "}
          adresinden ulaşabilir, ayrıntılı bilgiler için{" "}
          <Link href="/iletisim" className="underline hover:text-zinc-900">
            İletişim ve Künye
          </Link>{" "}
          sayfamıza bakabilirsiniz.
        </p>
      </div>
    </main>
  );
}
