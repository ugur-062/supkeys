import {
  CheckBadgeIcon,
  LockClosedIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";

/**
 * "Nasıl çalışır" + güven bandı — AÇIK zemin (`bg-zinc-50`).
 *
 * Ritim renkle değil YÜZEYLE kuruluyor: beyaz bölümler ile gri bant
 * arasındaki geçiş, koyu bant kadar net ayırıyor ama sayfayı ağırlaştırmıyor.
 *
 * İçerik her zaman DOĞRU: envanterden bağımsız, ürünün nasıl çalıştığını
 * anlatıyor. Az kayıtlı bir pazar yerinde sayfayı ayakta tutan şey bu.
 */
const STEPS = [
  {
    icon: UsersIcon,
    title: "Kaydol ve firmanı tanıt",
    body: "Tek hesapla hem alıcı hem satıcı olursun. Faaliyet alanını ve kategorilerini seç; eşleşen talepler sana gelsin.",
  },
  {
    icon: LockClosedIcon,
    title: "Kapalı zarf teklif ver",
    body: "Teklifini yalnız talep sahibi görür. Rakip tedarikçiler ne teklifini, ne kimliğini, ne de kaç teklif geldiğini görebilir.",
  },
  {
    icon: CheckBadgeIcon,
    title: "Siparişe dönüştür",
    body: "Kazandırma kararıyla sipariş otomatik oluşur; teslim ve ödeme adımlarını aynı panelden takip edersin.",
  },
];

/** Adımlar dışa açık — `/nasil-calisir` aynı üç adımı basar (tek kaynak). */
export const HOW_IT_WORKS_STEPS = STEPS;

export function TrustBand() {
  return (
    <section id="nasil-calisir" className="scroll-mt-24 border-t border-zinc-950/5 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24 lg:px-8">
        <p className="text-sm/6 font-semibold text-emerald-600">Nasıl çalışır</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
          Talepten teklife, tekliften siparişe
        </h2>
        <p className="mt-4 max-w-2xl text-lg/8 text-pretty text-zinc-500">
          İncelemek ücretsiz. Teklif vermek ve firma detayları için ücretsiz
          hesap; komisyon alınmaz.
        </p>

        {/* Application UI — Data display / Stats / "with shared borders":
            paylaşılan kenarlı ızgara. Ayrı ayrı kart yerine tek bir yüzey
            olması, üç adımın SIRALI bir akış olduğunu gösteriyor. */}
        <ol className="mt-12 grid grid-cols-1 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="p-7">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <s.icon aria-hidden className="size-5 text-zinc-300" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-950">
                {s.title}
              </h3>
              <p className="mt-2 text-sm/6 text-zinc-500">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
