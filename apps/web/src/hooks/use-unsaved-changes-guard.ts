"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useConfirm } from "@/components/providers/confirm-dialog";

/**
 * KAYDEDİLMEMİŞ DEĞİŞİKLİK KORUMASI (arayüz testi O-098).
 *
 * App Router'da gezinme olayı yok; korumanın iki yarısı var:
 *  · sekme kapatma / yenileme → tarayıcının `beforeunload` uyarısı,
 *  · uygulama içi bağlantı (kenar çubuğu, üst çubuk…) → belge düzeyinde
 *    YAKALAMA aşamasında tıklama dinlenir; iç bağlantıysa gezinme durdurulur,
 *    çevrili onay diyaloğu sorulur, "Ayrıl" denirse aynı adrese gidilir.
 *    Yakalama aşaması Next `<Link>`'in kendi işleyicisinden ÖNCE çalışır.
 *
 * Bağlantı olmayan geri düğmeleri (ör. "Ürünlere dön") `confirmLeave()` ile
 * aynı diyaloğu sorar. Yeni sekmede açılan, indirme ve sayfa içi (#) bağlantılar
 * ile değiştirici tuşlu tıklamalar dokunulmadan geçer.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const t = useTranslations("web.panel.shell.unsavedChanges");
  const confirm = useConfirm();
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const ask = useCallback(
    () =>
      confirm({
        title: t("baslik"),
        description: t("aciklama"),
        confirmLabel: t("ayril"),
        cancelLabel: t("kal"),
        destructive: true,
      }),
    [confirm, t],
  );

  /** Bağlantı dışı çıkışlar için: kirli değilse hemen true. */
  const confirmLeave = useCallback(async () => (dirtyRef.current ? ask() : true), [ask]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location;
      if (url.pathname === here.pathname && url.search === here.search) return; // yalnız #hash ya da aynı sayfa
      e.preventDefault();
      e.stopPropagation();
      void ask().then((leave) => {
        if (leave) {
          dirtyRef.current = false;
          router.push(url.pathname + url.search + url.hash);
        }
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, ask, router]);

  return { confirmLeave };
}
