"use client";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * PAZAR BANDI — panelin içindeki pazar bölgesinin "marka çapası".
 *
 * Europages'te her ekranın tepesinde koyu bir bant var ve göz oraya
 * tutunuyor. Rothern'de üst çubuk beyaz ve ince olduğu için liste sayfaları
 * "gövdesiz" duruyordu. Üst çubuğu pazar rotalarında koyulaştırmak yerine
 * (sol menü ve panel bölgesi hiç değişmesin diye) her pazar sayfasının
 * başına bu bant konur: kırıntı + başlık + sonuç sayısı + arama, hepsi
 * bandın İÇİNDE yaşar.
 *
 * Bant panel kabuğunun içinde yaşar (tam genişlik değil): kabuğun kenar
 * boşluğunu kırmak sol menüyle hizayı bozardı.
 */
export function MarketBand({
  breadcrumb,
  title,
  lead,
  search,
  tabs,
  aside,
}: {
  breadcrumb: { label: string; href?: string }[];
  /** Metin ya da iskelet — kategori sayfası ad gelene dek yer tutucu basar. */
  title: ReactNode;
  lead?: string;
  /** Bandın içindeki arama formu (sayfanın kendi süzgeç kabuğuna yazar). */
  search?: ReactNode;
  /** Ürünler | Firmalar geçişi + sayılar. */
  tabs?: ReactNode;
  /** Başlığın sağındaki ikincil içerik (kategori görseli vb.). */
  aside?: ReactNode;
}) {
  return (
    /* MAVİ (2026-09-07, kullanıcı: "siyah ağırlıklı yapma"): bant satınalma
       portalının kendi vurgu rengine geçti. Panelde yeni bir ton değil —
       hero arama, AI anahtarı ve kategori vitrini zaten bu mavi. */
    <section className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 px-5 py-6 text-white sm:px-8 sm:py-8">
      <Breadcrumb
        items={breadcrumb}
        // Kırıntı açık zemin için yazılmış (son öğe zinc-900); koyu bantta
        // renkler tersine çevrilir. Bileşeni ikiye bölmek yerine yerinde
        // ezmek yeterli — tek kullanım yeri burası.
        className="!text-zinc-500 [&_a:hover]:!text-white [&_a]:!text-zinc-300 [&_span]:!text-white"
      />
      <div className={aside ? "mt-3 grid items-start gap-6 lg:grid-cols-[1fr_16rem]" : "mt-3"}>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
          {lead ? <p className="mt-2 max-w-2xl text-sm/6 text-zinc-400">{lead}</p> : null}
          {search ? <div className="mt-5 max-w-2xl">{search}</div> : null}
        </div>
        {aside}
      </div>
      {tabs ? <div className="mt-6 border-t border-white/10 pt-4">{tabs}</div> : null}
    </section>
  );
}

/**
 * DÜZ PAZAR BAŞLIĞI — kırıntı + H1, koyu bant YOK.
 *
 * 2026-09-07 (kullanıcı kararı): ürün dizininde ve kategori sayfasında koyu
 * bant kaldırıldı. Gerekçe: listeye gelen kullanıcı ne aradığını zaten
 * biliyor; başlık + açıklama + arama + sekmeler birlikte ürün ızgarasını
 * ekranın altına itiyordu. Kalan iki şey sayfanın kimliği: "neredeyim"
 * (kırıntı) ve sayfanın adı (H1 — a11y'de zorunlu, sayfa başlıksız kalamaz).
 *
 * Arama kaybolmadı, YERİ değişti: anasayfadaki büyük kutu `?q=` ile bu
 * listeye yazar; kenar süzgeçleri ve çipler aynen duruyor.
 */
export function MarketHeader({
  breadcrumb,
  title,
  trailing,
}: {
  breadcrumb: { label: string; href?: string }[];
  /** Metin ya da iskelet — kategori sayfası ad gelene dek yer tutucu basar. */
  title: ReactNode;
  /** Başlığın sağındaki ikincil bağlantı (ör. "Firmalar"). */
  trailing?: ReactNode;
}) {
  return (
    <div className="pt-1">
      <Breadcrumb items={breadcrumb} />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
        {trailing}
      </div>
    </div>
  );
}

/**
 * ÜRÜNLER | FİRMALAR geçişi — aynı sorgu iki sayıyla.
 *
 * "56 ürün · 20 firma" tek satırda durur ki alıcı aradığı şeyin hangi
 * tarafta olduğunu tıklamadan görsün: kompanzasyon panosu arayan biri
 * bazen ürünü değil ÜRETİCİYİ arıyordur.
 */
export function MarketTabs({
  active,
  productsHref,
  companiesHref,
  productCount,
  companyCount,
}: {
  active: "products" | "companies";
  productsHref: string;
  companiesHref: string;
  productCount?: number;
  companyCount?: number;
}) {
  const tab = (key: "products" | "companies", href: string, label: string, count?: number) => (
    <Link
      key={key}
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active === key ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
      {count != null ? (
        <span className={`tnum text-xs font-medium ${active === key ? "text-zinc-500" : "text-zinc-400"}`}>
          {count.toLocaleString("tr-TR")}
        </span>
      ) : null}
    </Link>
  );
  return (
    <nav aria-label="Sonuç türü" className="flex flex-wrap items-center gap-1">
      {tab("products", productsHref, "Ürünler", productCount)}
      {tab("companies", companiesHref, "Firmalar", companyCount)}
    </nav>
  );
}
