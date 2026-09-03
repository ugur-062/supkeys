import {
  BanknotesIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from "@heroicons/react/20/solid";

/**
 * GÜVEN BANDI — hero'nun hemen altında, her zaman görünür (2026-09-04).
 *
 * Dört madde ürünün GERÇEKTEN yaptığı şeyler; başka iddia yok:
 *  · doğrulama = vergi levhası + ticaret sicili belgeleri, admin onayı
 *    (KYC akışı, `setVerification`),
 *  · kapalı zarf = teklifçiler birbirini görmez (Aracılık Sözleşmesi md. 3),
 *  · komisyon yok = platform işlem bedelinden pay almaz (yalnız paket satar),
 *  · KVKK = aydınlatma metni + başvuru kanalı (`/sozlesmeler/kvkk`).
 */
const ITEMS = [
  {
    icon: CheckBadgeIcon,
    title: "Doğrulanmış firmalar",
    body: "Vergi levhası ve ticaret sicili belgesiyle kimlik doğrulaması.",
  },
  {
    icon: LockClosedIcon,
    title: "Kapalı zarf teklif",
    body: "Teklifinizi yalnız ilan sahibi görür; rakipler göremez.",
  },
  {
    icon: BanknotesIcon,
    title: "Komisyon yok",
    body: "Alım-satım bedelinden platform pay almaz.",
  },
  {
    icon: ShieldCheckIcon,
    title: "KVKK uyumlu",
    body: "Verileriniz Türkiye mevzuatına uygun işlenir.",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Güven unsurları" className="border-y border-zinc-950/5 bg-zinc-50">
      <ul className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-zinc-950/5 px-6 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:px-8">
        {ITEMS.map((it) => (
          <li key={it.title} className="flex items-start gap-3 py-5 lg:px-6 lg:first:pl-0 lg:last:pr-0">
            <it.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-zinc-950">{it.title}</p>
              <p className="mt-0.5 text-xs/5 text-zinc-500">{it.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
