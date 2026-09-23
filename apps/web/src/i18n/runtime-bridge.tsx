"use client";

import type { WebMessages } from "@rothern/i18n";
import { useLocale, useMessages } from "next-intl";
import { useEffect } from "react";
import { registerI18nRuntime, unregisterI18nRuntime } from "./runtime";

/**
 * Sağlayıcının dilini/mesajlarını React dışı köprüye kaydeder (axios
 * interceptor'ları `Accept-Language` ve hata metinlerini buradan okur).
 * `<html lang>` sunucuda `[locale]/layout.tsx` tarafından basılır.
 */
export function I18nRuntimeBridge() {
  const locale = useLocale();
  const messages = useMessages() as WebMessages;
  useEffect(() => {
    registerI18nRuntime(locale, messages);
    return () => unregisterI18nRuntime();
  }, [locale, messages]);
  return null;
}
