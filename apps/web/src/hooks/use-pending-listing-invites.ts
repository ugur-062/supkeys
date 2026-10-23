"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";
import { isLocale, type Locale } from "@rothern/i18n";
import {
  useExternalTenderInvite,
  useInviteDiscoveredMembers,
  type ExternalInviteTarget,
  type MemberInviteTarget,
} from "@/hooks/use-supplier-discovery";
import { inviteWillLeave } from "@/lib/tenders/external-invite-status";
import {
  MAX_PENDING_EXTERNAL_INVITES,
  clearSession,
  normalizeExternalInvites,
  normalizeMemberInvites,
  pendingInvitesKey,
  pendingMemberInvitesKey,
  readSession,
} from "@/lib/tenders/quick-draft";

export interface PendingListingInvites {
  external: ExternalInviteTarget[];
  members: MemberInviteTarget[];
}

/**
 * Taslakta bekletilen davetler (derin denetim X22). Hızlı talep "Taslak
 * kaydet", AI'ın bulduğu dış adresleri ve Rothern üyelerini talebe bağlı
 * sessionStorage anahtarlarına yazar ("yayında gider"). Bunları eskiden
 * yalnız hızlı talebin düzenleme kartı okuyordu; talep detayındaki "Yayınla"
 * yalnız yayın ucunu çağırdığından davetler SESSİZCE düşüyordu.
 *
 * `read()` bekleyenleri okur (onay metninde sayı göstermek için); `flush()`
 * talep yayınlandıktan SONRA gönderir, sonucu hızlı talepteki toast'larla
 * bildirir. Başarılı gönderilen liste silinir; hata alan liste saklı kalır
 * (düzenleme kartı yeniden dener). Hata yayını geri almaz.
 */
export function usePendingListingInvites(listingId: string) {
  const uiLocale = useLocale();
  const fallback: Locale = isLocale(uiLocale) ? uiLocale : "tr";
  const tr = useTranslations("web.panel.requests.quickRequest");
  const sendExternal = useExternalTenderInvite();
  const sendMembers = useInviteDiscoveredMembers();

  const read = useCallback(
    (): PendingListingInvites => ({
      external: normalizeExternalInvites(
        readSession<unknown>(pendingInvitesKey(listingId)),
        fallback,
      ).slice(0, MAX_PENDING_EXTERNAL_INVITES),
      members: normalizeMemberInvites(
        readSession<unknown>(pendingMemberInvitesKey(listingId)),
      ).slice(0, MAX_PENDING_EXTERNAL_INVITES),
    }),
    [listingId, fallback],
  );

  const flush = useCallback(async (): Promise<void> => {
    const { external, members } = read();
    if (members.length > 0) {
      try {
        const results = await sendMembers.mutateAsync({
          listingId,
          companyIds: members.map((m) => m.companyId),
        });
        clearSession(pendingMemberInvitesKey(listingId));
        const invited = results.filter((r) => r.status === "INVITED").length;
        if (invited > 0) toast.success(tr("uyeDavetEdildi", { n: invited }));
      } catch {
        toast.warning(tr("uyeDavetleriGonderilemedi"));
      }
    }
    if (external.length > 0) {
      try {
        const results = await sendExternal.mutateAsync({
          listingId,
          invites: external,
          source: "AI_FORM",
        });
        clearSession(pendingInvitesKey(listingId));
        const sent = results.filter((r) => inviteWillLeave(r)).length;
        if (sent > 0) toast.success(tr("disDavetSirayaAlindi", { n: sent }));
        if (sent < results.length)
          toast.warning(tr("disDavetGonderilmedi", { n: results.length - sent }));
      } catch {
        toast.warning(tr("disDavetlerGonderilemedi"));
      }
    }
  }, [read, listingId, sendMembers, sendExternal, tr]);

  return { read, flush };
}
