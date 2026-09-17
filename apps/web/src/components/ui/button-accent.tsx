"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PortalKey } from "@/lib/company/portals";

/**
 * BİRİNCİL DÜĞME RENGİ PORTALDAN GELİR (2026-09-17, kullanıcı kararı:
 * "sistemde genel olarak tuşlar siyah, bunu istemiyorum — satınalmada mavi,
 * satışta yeşil"). Catalyst düğmesinin varsayılan rengi `dark/zinc`
 * (siyah); firma kabuğu aktif portala göre bu bağlamı sağlar, `color`
 * verilmemiş her dolgulu düğme onu okur. Kabuk dışı (herkese açık pazar
 * yeri, giriş/kayıt) varsayılan MAVİ (aynı gün ikinci karar; monokrom
 * public yüzeyde yalnız düğmeler mavi).
 *
 * Renk çağırandan gelir, bileşen portal bilmez: bu dosya yalnız bağlamı
 * taşır; hangi portalın hangi renk olduğu tek yerde (`accentForPortal`).
 */
export type ButtonAccent = "dark/zinc" | "blue" | "emerald";

/* VARSAYILAN MAVİ (2026-09-17, kullanıcı: "herkese açık yerlerde de mavi
   olsun"): kabuk dışında — giriş/kayıt, pazar yeri, pazarlama — dolgulu düğme
   mavi. Siyah (`dark/zinc`) yalnız açıkça `color` verilirse. */
const ButtonAccentContext = createContext<ButtonAccent>("blue");

export function accentForPortal(portal: PortalKey): ButtonAccent {
  return portal === "satinalma" ? "blue" : "emerald";
}

export function ButtonAccentProvider({
  accent,
  children,
}: {
  accent: ButtonAccent;
  children: ReactNode;
}) {
  return (
    <ButtonAccentContext.Provider value={accent}>{children}</ButtonAccentContext.Provider>
  );
}

export function useButtonAccent(): ButtonAccent {
  return useContext(ButtonAccentContext);
}

/** Elle çizilen dolgulu bağlantı/düğme için portal rengi sınıfları. */
export function accentFillClass(accent: ButtonAccent): string {
  return accent === "emerald"
    ? "bg-emerald-600 hover:bg-emerald-700"
    : accent === "blue"
      ? "bg-blue-600 hover:bg-blue-700"
      : "bg-zinc-900 hover:bg-zinc-800";
}
