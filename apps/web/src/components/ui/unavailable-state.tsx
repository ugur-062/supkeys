"use client";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CloudOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * "ŞU ANDA YÜKLENEMİYOR" EKRANI (2026-10-08, staging kesintisi).
 *
 * Sunucu API'ye ulaşamayınca (uyuyan staging API'si, dağıtım, kesinti) genel
 * "Bir şeyler ters gitti" yerine çizilir: ne olduğunu söyler, kendiliğinden
 * birkaç kez yeniden dener, sonra DURUR. Elle "Tekrar dene" her zaman vardır.
 *
 * Otomatik denemeler büyüyen aralıklarla (`AUTO_RETRY_DELAYS_MS`): toplam ~75
 * sn bekleme + her denemede sunucunun kendi kısa bütçesi (`upstream-retry.ts`)
 * ≈ uyuyan API'nin uyanma süresini (~1 dk) köprüler. Sonsuz döngü yok: açık
 * unutulan sekme sunucuyu sürekli yoklamaz.
 */
export const AUTO_RETRY_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000];

/** Bu kadar süredir kesinti görülmeyen adresin sayacı sıfırdan başlar (ms). */
const ATTEMPT_MEMORY_MS = 120_000;

/**
 * Adres başına yapılan otomatik deneme sayısı — MODÜL düzeyinde: başarısız
 * denemeden sonra hata sınırı bu bileşeni yeniden bağlayabilir (bileşen
 * durumu sıfırlanır); sayaç burada yaşadığı için "birkaç kez, sonra dur"
 * kuralı korunur. Tam sayfa yenilemesi sayacı sıfırlar (kullanıcının kendi
 * denemesi).
 */
const attemptsByAddress = new Map<string, { count: number; at: number }>();

/** Yalnız testler için. */
export function resetAutoRetryMemory(): void {
  attemptsByAddress.clear();
}

const addressKey = () => `${window.location.pathname}${window.location.search}`;

function attemptsFor(key: string): number {
  const entry = attemptsByAddress.get(key);
  return entry && Date.now() - entry.at < ATTEMPT_MEMORY_MS ? entry.count : 0;
}

export type AutoRetryPhase = "waiting" | "retrying" | "stopped";

/**
 * `error` her yeni kesintide (ilk çizim ya da başarısız deneme) değişir; kanca
 * sıradaki otomatik denemeyi kurar. `retry` bir GEÇİŞ içinde çağrılır — hata
 * sınırı kuralı: `router.refresh()` + `reset()` aynı geçişte.
 */
export function useAutoRetry(error: unknown, retry: () => void): { phase: AutoRetryPhase; retryNow: () => void } {
  const [isPending, startTransition] = useTransition();
  const [stopped, setStopped] = useState(false);
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);

  useEffect(() => {
    if (isPending) return;
    const key = addressKey();
    const count = attemptsFor(key);
    attemptsByAddress.set(key, { count, at: Date.now() });
    if (count >= AUTO_RETRY_DELAYS_MS.length) {
      setStopped(true);
      return;
    }
    setStopped(false);
    const fire = () => {
      attemptsByAddress.set(key, { count: count + 1, at: Date.now() });
      startTransition(() => retryRef.current());
    };
    // Gizli sekmede sunucu yoklanmaz: süre dolduysa sekme görünür olunca dener.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      fire();
    };
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") document.addEventListener("visibilitychange", onVisible);
      else fire();
    }, AUTO_RETRY_DELAYS_MS[count]);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [error, isPending]);

  const retryNow = () => startTransition(() => retryRef.current());
  return { phase: isPending ? "retrying" : stopped ? "stopped" : "waiting", retryNow };
}

interface UnavailableStateProps {
  /** Hata sınırının verdiği hata — kimliği her başarısız denemede değişir. */
  error: unknown;
  /** Rotayı sunucudan yeniden iste + sınırı sıfırla (bileşen geçişe sarar). */
  onRetry: () => void;
  className?: string;
}

export function UnavailableState({ error, onRetry, className }: UnavailableStateProps) {
  const t = useTranslations("web.shared.unavailable");
  const { phase, retryNow } = useAutoRetry(error, onRetry);
  return (
    <div
      data-unavailable={phase}
      className={
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-950/10 bg-white px-6 py-12 text-center" +
        (className ? ` ${className}` : "")
      }
    >
      <CloudOff className="size-8 text-zinc-500" aria-hidden="true" />
      {/* Ekran okuyucu: içerik bu kartla değişti → başlık + açıklama hemen
          okunur; aşama satırı AYRI ve kibar bölgede (her aşamada kart baştan
          okunmasın). */}
      <div role="alert" className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">{t("title")}</p>
        <p className="max-w-sm text-sm text-zinc-600">{t("body")}</p>
      </div>
      <p role="status" className="flex min-h-5 items-center justify-center gap-2 text-sm text-zinc-600">
        {phase === "retrying" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t(phase)}
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={retryNow} disabled={phase === "retrying"}>
        {t("retry")}
      </Button>
      {/* ÇIKIŞ YOLU (canlı doğrulama OUT-5): bu ekran sayfanın tamamının yerine
          çizilir (üst çubuk, logo, menü yok) — kesinti sürerken ziyaretçi
          çıkmaza girmesin. Anasayfa ve önbellekteki listeler kesintide de
          açılır. Dil ön eki `@/i18n/navigation`dan. */}
      <Link
        href="/"
        className="-mt-1 inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
      >
        {t("home")}
      </Link>
    </div>
  );
}
