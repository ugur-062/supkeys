"use client";

import { useLocale, useMessages } from "next-intl";
import { useEffect } from "react";
import type { WebMessages } from "@rothern/i18n";
import { registerI18nRuntime, unregisterI18nRuntime } from "./runtime";

/**
 * Sağlayıcının dilini/mesajlarını React dışı köprüye kaydeder ve `<html lang>`
 * özniteliğini istemcide günceller (kök layout Faz 1'e kadar sabit `tr` basar;
 * ekran okuyucu ve tarayıcı çeviri önerisi için lang doğru olmalı).
 */
export function I18nRuntimeBridge() {
  const locale = useLocale();
  const messages = useMessages() as WebMessages;
  useEffect(() => {
    registerI18nRuntime(locale, messages);
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      unregisterI18nRuntime();
      document.documentElement.lang = previous;
    };
  }, [locale, messages]);
  return null;
}
