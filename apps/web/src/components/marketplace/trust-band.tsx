import { GridPattern } from "./grid-pattern";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * "Nasıl çalışır" + güven bandı — KOYU.
 *
 * Sayfanın sonunda ikinci bir koyu bant, hero ile birlikte açık zeminli
 * envanter bölümlerini arasına alıyor: açık-koyu-açık-koyu ritmi, envanter
 * azken bile sayfaya omurga veriyor. Eskiden burası üç beyaz kutuydu ve
 * üstündeki beyaz bölümlerden ayrışmıyordu.
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

export function TrustBand() {
  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 px-6 py-20 sm:py-24 lg:px-8">
      <GridPattern
        id="trust-grid"
        className="[mask-image:radial-gradient(48rem_32rem_at_50%_100%,white,transparent)]"
      />
      <div className="relative mx-auto max-w-7xl">
        <p className="text-sm/6 font-semibold text-emerald-400">Nasıl çalışır</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
          Talepten teklife, tekliften siparişe
        </h2>
        <p className="mt-4 max-w-2xl text-lg/8 text-pretty text-zinc-400">
          Görmek üyelik istemez. Teklif vermek ücretsiz hesapla; komisyon
          alınmaz.
        </p>

        <ol className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-zinc-950 p-7">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-950">
                  {i + 1}
                </span>
                <s.icon aria-hidden className="size-5 text-zinc-600" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                {s.title}
              </h3>
              <p className="mt-2 text-sm/6 text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/company/kayit"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Ücretsiz kaydol
          </Link>
          <Link
            href="/nasil-calisir"
            className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 transition hover:text-white"
          >
            Ürünü ve paketleri incele
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
