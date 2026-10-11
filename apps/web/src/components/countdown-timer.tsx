"use client";

import { useTranslations } from "next-intl";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface CountdownTimerProps {
  /** ISO datetime string */
  deadline: string;
  className?: string;
  /** Süre dolduğunda gösterilecek metin (verilmezse katalogdan). */
  expiredLabel?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function parts(deadline: Date, now: Date = new Date()): Parts {
  const totalMs = deadline.getTime() - now.getTime();
  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs };
  }
  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, totalMs };
}

/**
 * Performans audit P-11 — Her instance kendi `setInterval`'ını kurmak yerine
 * paylaşılan `useNow` hook'unu kullanır. Tenders liste sayfasında 20 satır =
 * önceden 20 timer, şimdi 1 timer.
 *
 * Bucket: <1 saat kalan tender'lar saniye-saniye (1s) tick alır; daha
 * uzunları dakika-bazlı (60s) tick yeterli. Mount anında karar verilir;
 * eşik geçişlerinde diğer bucket'a kendiliğinden geçmez (kullanıcı sayfayı
 * yenileyince ya da satır remount olunca yeniden hesaplanır — pratik kabul).
 */
export function CountdownTimer({
  deadline,
  className,
  expiredLabel,
}: CountdownTimerProps) {
  const t = useTranslations("web.panel.shell.countdownTimer");
  const target = useMemo(() => new Date(deadline), [deadline]);
  const initialTotalMs = useMemo(
    () => target.getTime() - Date.now(),
    [target],
  );
  const bucket: 1000 | 60_000 =
    initialTotalMs > 0 && initialTotalMs < 60 * 60 * 1000 ? 1000 : 60_000;
  const now = useNow(bucket);
  const p = parts(target, new Date(now));

  // Renk: <1sa kalan süreler kırmızı, <24sa sarı, daha fazlası nötr
  const tone =
    p.totalMs <= 0
      ? "text-slate-500"
      : p.totalMs < 60 * 60 * 1000
        ? "text-danger-600"
        : p.totalMs < 24 * 60 * 60 * 1000
          ? "text-warning-600"
          : "text-zinc-700";

  // En büyük iki birim: "3 gün 4 saat" → "2 saat 15 dk" → "5 dk 30 sn" → "12 sn".
  const label =
    p.totalMs <= 0
      ? (expiredLabel ?? t("suresiDoldu"))
      : p.days > 0
        ? t("gunSaat", { days: p.days, hours: p.hours })
        : p.hours > 0
          ? t("saatDk", { hours: p.hours, minutes: p.minutes })
          : p.minutes > 0
            ? t("dkSn", { minutes: p.minutes, seconds: p.seconds })
            : t("sn", { seconds: p.seconds });

  return (
    <span className={cn("tabular-nums font-semibold", tone, className)}>
      {label}
    </span>
  );
}
