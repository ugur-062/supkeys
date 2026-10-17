import { useTranslations } from "next-intl";
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
const STEP_ICONS = [UsersIcon, LockClosedIcon, CheckBadgeIcon] as const;

export function TrustBand() {
  const t = useTranslations("web.marketing.trustBand");
  const STEPS = ([1, 2, 3] as const).map((n, i) => ({
    icon: STEP_ICONS[i]!,
    title: t(`step${n}Title`),
    body: t(`step${n}Body`),
  }));
  return (
    <section id="nasil-calisir" className="scroll-mt-24 border-t border-zinc-950/5 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24 lg:px-8">
        <p className="text-sm/6 font-semibold text-emerald-700">{t("eyebrow")}</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 max-w-2xl text-lg/8 text-pretty text-zinc-500">{t("lead")}</p>

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
