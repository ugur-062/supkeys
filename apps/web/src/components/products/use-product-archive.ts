"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useSetProductActive } from "@/hooks/use-company-items";
import { extractErrorMessage } from "@/lib/tenders/error";
import { isAxiosError } from "axios";

/**
 * ÜRÜN ARŞİVLE / GERİ AL (arayüz testi O-039) — liste satırının ⋮ menüsü ve
 * düzenleyicinin ⋮ menüsü AYNI akışı kullanır: çevrili onay → `PATCH :id/active`
 * → tek toast. Kalıcı silme bilinçli YOK (CLAUDE.md: arşivlemek serbest).
 *
 * Sunucu yanıtlı hatada (ör. geri almada paket tavanı 403) toast'ı küresel
 * yakalayıcı zaten basar — burada ikinci kez basılmaz.
 */
export function useProductArchive() {
  const t = useTranslations("web.panel.trade.productsView");
  const confirm = useConfirm();
  const setActive = useSetProductActive();

  const run = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      await setActive.mutateAsync({ id, isActive });
      toast.success(isActive ? t("geriAlindi") : t("arsivlendi"));
      return true;
    } catch (err) {
      if (!(isAxiosError(err) && err.response)) {
        toast.error(extractErrorMessage(err, isActive ? t("geriAlinamadi") : t("arsivlenemedi")));
      }
      return false;
    }
  };

  /** Onay sorar; arşivlendiyse true. */
  const archive = async (id: string): Promise<boolean> => {
    const ok = await confirm({
      title: t("arsivOnayBaslik"),
      description: t("arsivOnayAciklama"),
      confirmLabel: t("arsivle"),
    });
    if (!ok) return false;
    return run(id, false);
  };

  const restore = (id: string) => run(id, true);

  return { archive, restore, pending: setActive.isPending };
}
