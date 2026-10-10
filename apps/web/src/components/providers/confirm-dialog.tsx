"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { useButtonAccent, type ButtonAccent } from "@/components/ui/button-accent";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

/**
 * Sağlayıcıya giden istek: seçenekler + onayı İSTEYEN yerin düğme rengi.
 *
 * Sağlayıcı firma kabuğunun DIŞINDA bağlıdır (`authed-layout-client.tsx`),
 * portal rengi ise kabuğun içinde sağlanır (`ButtonAccentProvider`): pencere
 * kendi konumundan okusaydı Satış portalında da varsayılan MAVİ düğme çizerdi
 * (son canlı kontrol NEW-PF-6 — "Vitrinden çek" onayı maviydi, aynı sayfadaki
 * "Düzenle" yeşil). Rengi `useConfirm` çağıranın bağlamından okur ve istekle
 * taşır: pencere nereye bağlı olursa olsun, soran sayfanın rengini giyer.
 */
type ConfirmRequest = ConfirmOptions & { accent: ButtonAccent };

const ConfirmContext = createContext<((req: ConfirmRequest) => Promise<boolean>) | null>(null);

/**
 * İmperatif onay diyaloğu — native window.confirm() yerine Catalyst UI.
 * `const confirm = useConfirm();  if (!(await confirm({...}))) return;`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.shell.confirmDialog");
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmRequest) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onClose={() => settle(false)}>
        <DialogTitle>{opts?.title}</DialogTitle>
        {opts?.description ? (
          <DialogDescription>{opts.description}</DialogDescription>
        ) : null}
        <DialogActions>
          {/* Dalga B-4 (denetim P10): odak YIKICI butondaydı — diyalog açılır
              açılmaz Enter'a basmak (ya da klavyeyle gezinen bir kullanıcının
              refleksi) kazandırmayı finalize etmek, teklifi elemek, hesabı
              silmek gibi GERİ ALINAMAZ işlemi tek tuşta yapıyordu. Yıkıcı
              diyalogda odak güvenli seçenekte durur; onay bilinçli bir jest
              gerektirir. Yıkıcı olmayanlarda eski davranış korunur. */}
          <Button
            plain
            onClick={() => settle(false)}
            autoFocus={opts?.destructive === true}
          >
            {opts?.cancelLabel ?? t("vazgec")}
          </Button>
          <Button
            color={opts?.destructive ? "red" : opts?.accent}
            onClick={() => settle(true)}
            autoFocus={opts?.destructive !== true}
          >
            {opts?.confirmLabel ?? t("onayla")}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Çağıranın portal rengi (kabuk dışında varsayılan) — bkz. `ConfirmRequest`.
  const accent = useButtonAccent();
  const confirm = useCallback<ConfirmFn>(
    (opts) => (ctx ? ctx({ ...opts, accent }) : Promise.resolve(false)),
    [ctx, accent],
  );
  if (!ctx) {
    // Geliştirici hatası — kullanıcıya görünmez, kataloğa girmez.
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı");
  }
  return confirm;
}
