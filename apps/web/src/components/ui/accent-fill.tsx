"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { accentFillClass, useButtonAccent } from "./button-accent";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

/**
 * Elle çizilen dolgulu bağlantı/düğme için PORTAL RENGİ (2026-09-18):
 * sunucu bileşenleri (pazar yeri sayfaları) bağlam okuyamaz; bu küçük
 * istemci sarmalayıcıları `ButtonAccentProvider`dan rengi alır. Sınıf
 * listesine dolgu rengi EKLENİR — çağıran `bg-*` vermez.
 */
export function useAccentFill(): string {
  return accentFillClass(useButtonAccent());
}

export function AccentLink({ className, ...props }: ComponentProps<typeof Link>) {
  const fill = useAccentFill();
  return <Link {...props} className={cn(className, fill)} />;
}

export function AccentButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const fill = useAccentFill();
  return <button {...props} className={cn(className, fill)} />;
}
