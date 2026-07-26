import { OPERATOR } from "@/lib/company-info";
import Link from "next/link";

export const metadata = { title: "İletişim ve Künye — Rothern" };

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
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Ana sayfa
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">
        İletişim ve Künye
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Rothern, {OPERATOR.legalName} tarafından işletilen B2B e-tedarik ve
        e-ihale platformudur. Sorularınız için{" "}
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
      <dl className="mt-8 divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
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
    </main>
  );
}
