"use client";

import { hasAnySeatPermission } from "@/lib/company/permissions";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { useButtonAccent } from "@/components/ui/button-accent";
import { tierAtLeast } from "@rothern/shared";
import {
  Dialog,
} from "@headlessui/react";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Perf turu (denetim P10 Dalga B): launcher firma kabuğunda, yani HER
 * kimlikli sayfada mount ediliyor; panel içeriği yalnız açılınca render
 * ediliyordu ama import STATİKTİ → sohbet paneli, markdown/araç izleri ve
 * bağımlılıkları hiç açılmasa da her sayfanın ilk yükünde geliyordu.
 */
const AssistantPanel = dynamic(
  () => import("./assistant-panel").then((m) => m.AssistantPanel),
  { ssr: false },
);

/** Karşılama balonu oturumda BİR KEZ gösterilir (sayfa geçişlerinde tekrar
 *  çıkıp rahatsız etmesin); ~6sn sonra kendiliğinden kaybolur (Faz 8.2:
 *  12sn'lik balon sağ-alt KPI kartının hover/tıklamasını uzun süre
 *  yutuyordu — süre kısaldı, kapatma X'i zaten var). */
const GREET_SEEN_KEY = "ai-assistant-greeted";
const GREET_HIDE_MS = 6_000;

/**
 * Faz AI-2 — sağ-alt floating launcher + sağdan slide-over asistan paneli.
 * Yalnız Silver+ ∧ SA/ST kullanıcıda görünür (AI-0 erişim kapısıyla aynı; asıl
 * güvenlik backend'de — bu UX katmanı). Panel açık değilken içerik mount edilmez.
 */
export function AssistantLauncher() {
  const accent = useButtonAccent();
  const { user, company } = useCompanyAuth();
  const [open, setOpen] = useState(false);
  // §4.4: genişletme seçeneği — dar sohbet / geniş okuma.
  const [wide, setWide] = useState(false);
  const [greet, setGreet] = useState(false);
  // Faz 8.2 — FAB scroll'da küçülür: grafik/tablo son kolonuna daha az biner.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const eligible =
    !!user &&
    !!company &&
    tierAtLeast(company.tier, "SILVER") &&
    hasAnySeatPermission(user);

  // İlk girişte karşılama balonu — kısa gecikmeyle belirir, 12sn sonra gider.
  // "Görüldü" işareti balon fiilen GÖSTERİLİNCE yazılır (StrictMode'un çift
  // effect koşusu balonu hiç göstermeden işaretlemesin).
  useEffect(() => {
    if (!eligible || sessionStorage.getItem(GREET_SEEN_KEY)) return;
    const show = setTimeout(() => {
      sessionStorage.setItem(GREET_SEEN_KEY, "1");
      setGreet(true);
    }, 800);
    const hide = setTimeout(() => setGreet(false), 800 + GREET_HIDE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [eligible]);

  // Escape ile kapat — modal olmadığı için Headless'ın kapatma davranışı yok.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!eligible) return null;

  const openPanel = () => {
    setGreet(false);
    setOpen(true);
  };

  return (
    <>
      {/* Karşılama balonu — tıklayınca panel açılır. C58/C8: yalnız görünürken
          MOUNT edilir — gizliyken DOM'da odaklanabilir görünmez butonlar
          bırakıyordu ve viewport sağ-altındaki tıklamaları yutabiliyordu. */}
      {greet && !open ? (
        <div className="fixed bottom-24 right-5 z-40 max-w-[260px]">
          <div className="relative rounded-2xl rounded-br-sm border border-brand-200 bg-white p-3.5 shadow-xl shadow-brand-900/10">
            <button
              type="button"
              aria-label="Karşılama mesajını kapat"
              onClick={() => setGreet(false)}
              className="absolute right-2 top-2 text-zinc-300 hover:text-zinc-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={openPanel}
              aria-label="Asistan panelini aç"
              className="text-left"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Sparkles className="h-4 w-4" /> Rothern Asistanı
              </p>
              <p className="mt-1 pr-3 text-sm text-zinc-600">
                {user.firstName ? `Merhaba ${user.firstName}.` : "Merhaba."}{" "}
                Size nasıl yardımcı olabilirim? Satın alma talebi açabilir, belge okuyabilir
                ya da sorularınızı yanıtlayabilirim.
              </p>
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="AI Asistan"
        onClick={openPanel}
        className={cn(
          "group fixed z-40 flex items-center justify-center rounded-full",
          // Portal rengi (2026-09-17): siyah yuvarlak düğme istenmiyor —
          // satınalmada mavi, satışta emerald (ButtonAccent ile aynı kaynak).
          accent === "blue"
            ? "bg-gradient-to-br from-blue-500 to-blue-700"
            : accent === "emerald"
              ? "bg-gradient-to-br from-emerald-500 to-emerald-700"
              : "bg-gradient-to-br from-brand-500 to-brand-700",
          "text-white shadow-lg ring-1 ring-white/20",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
          // Faz 8.2: scroll'da küçülüp köşeye yaklaşır — tablo son kolonunu
          // daha az kapatır (içerikte pb-24 nefes payı zaten var). B3: küçük
          // modda yarı saydam — geniş tablonun sağ kenarı okunur kalır.
          // KENAR PAYI = HALKA YAYILIMI (2026-09-07): `animate-ping` öğeyi
          // 2 katına büyütür, yani buton yarıçapı kadar dışarı taşar (56 px
          // butonda 28 px). Pay daha küçükken halka görünür alanı aşıyor ve
          // SİTENİN TAMAMINDA yatay kaydırma çubuğu çıkıyordu (kullanıcı
          // bulgusu). Pay halka yayılımından büyük tutulur.
          compact
            ? "bottom-6 right-6 h-11 w-11 opacity-60 hover:opacity-100 focus-visible:opacity-100"
            : "bottom-8 right-8 h-14 w-14",
        )}
      >
        {/* Nefes alan halka — buton kapalıyken sürekli, dikkat çekmeden */}
        {!open ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full [animation-duration:2.5s]",
              accent === "blue" ? "bg-blue-500/40" : accent === "emerald" ? "bg-emerald-500/40" : "bg-brand-500/40",
            )}
          />
        ) : null}
        <Sparkles
          className={cn(
            "h-6 w-6 transition-transform duration-300",
            "group-hover:rotate-12 group-hover:scale-110",
            greet ? "animate-bounce" : "",
          )}
        />
      </button>

      {/* YAN ÇEKMECE, MODAL DEĞİL (2026-09-17, kullanıcı: "asistan açıkken sol
          taraf kullanılabilir olmalı, tamamen blurlu oluyor"): arka plan
          perdesi ve odak kilidi yok; panel sağda durur, sayfa tıklanabilir.
          Kapatma: X düğmesi ya da Escape. */}
      {open ? (
        <aside
          role="complementary"
          aria-label="Rothern Asistanı"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-screen flex-col border-l border-zinc-950/10 bg-white shadow-2xl",
            wide ? "max-w-2xl" : "max-w-md",
          )}
        >
          {/* Başlık paneldedir (markalı kimlik + aksiyonlar tek satırda) */}
          <div className="min-h-0 flex-1">
            <AssistantPanel
              onClose={() => setOpen(false)}
              wide={wide}
              onToggleWide={() => setWide((w) => !w)}
            />
          </div>
        </aside>
      ) : null}
    </>
  );
}
