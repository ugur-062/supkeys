"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import {
  useEraseCompanyUser,
  useEraseUserPreview,
  type AdminCompanyUser,
  type AdminErasurePreview,
} from "@/hooks/use-admin-company-users";
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";
import { apiErrorMessage, apiErrorToastId, toastApiError } from "@/lib/api";
import { safeFormat } from "@/lib/date";
import axios from "axios";
import { toast } from "sonner";

/**
 * KVKK SİLME TALEBİ — ONAY PENCERESİ (2026-10-16, inceleme turu).
 *
 * Silme geri alınamaz ve yalnız operatörün aldığı bir e-postaya dayanır. Pencere
 * operatörün sorularını API'nin ön bilgisinden (`erase-preview`) yanıtlar:
 *  - Kim? Ad, kayıtlı adres; ekipten çıkarılmış kaydın satırında adres artık
 *    yer tutucudur → en son kullandığı adres (denetim kaydından), çıkarılma
 *    tarihi ve aynı adı taşıyan başka kayıt var mı.
 *  - Talep nasıl doğrulanır? Gelen e-postanın gönderen adresi kanıt değildir:
 *    operatör o adrese yazar, onayı o adresten bekler.
 *  - Reddedilir mi? (`blocker`, API'nin 409 kuralıyla aynı) Giriş yapabilen
 *    hesap kişinin kendisi tarafından uygulamada silinir; askıdaki firmanın son
 *    kullanıcısı silinirse askı kaydının yerine kapanış yazılırdı — önce askı
 *    kararı; anonimleştirilmiş firmada silinecek veri kalmadı. Bu durumlarda
 *    onay düğmesi pasiftir.
 *  - Firma kapanır mı, askıda mı?
 */

/**
 * Silmenin kural retleri (API `AccountDeletionService`, kişinin kendi
 * silmesiyle aynı kodlar + yöneticinin retleri). API iletisi kişiye hitap
 * edebilir ("Hesabınızı silmeden önce…"); admin ekranı kendi cümlesini basar.
 */
const ERASE_RULE_MESSAGES: Record<string, string> = {
  ACCOUNT_OWNER_MUST_TRANSFER:
    "Kurucu silinemez: firmada başka kullanıcılar var. Önce kuruculuk başka bir kullanıcıya devredilmeli ya da diğer kullanıcılar firmadan çıkarılmalı.",
  ACCOUNT_LAST_MANAGER:
    "Silinirse firmada kullanıcıları yönetebilecek aktif kimse kalmaz. Önce başka bir kullanıcıya kullanıcı yönetimi yetkisi verilmeli.",
  ACCOUNT_HAS_OPEN_WORK:
    "Firmanın son kullanıcısı: süren sipariş ya da açık talep varken silinemez. Önce bunlar sonuçlanmalı.",
  ACCOUNT_CAN_SIGN_IN:
    "Bu hesap hâlâ giriş yapabiliyor: kişi hesabını uygulamadaki “Hesabımı sil” ile kendisi silmeli.",
  ACCOUNT_COMPANY_SUSPENDED:
    "Firma askıda ve bu kişi son kullanıcı: önce askı kararı sonuçlanmalı (askıyı kaldırın ya da firmayı Özet › KVKK ile silin / anonimleştirin).",
  COMPANY_ANONYMIZED: "Firma KVKK ile anonimleştirildi; silinecek kişisel veri kalmadı.",
};

export function eraseRuleMessage(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const code = (e.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? (ERASE_RULE_MESSAGES[code] ?? null) : null;
}

function BlockerNotice({ preview }: { preview: AdminErasurePreview }) {
  if (!preview.blocker) return null;
  const tone = "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800";
  if (preview.blocker === "ACCOUNT_CAN_SIGN_IN") {
    return (
      <p className={tone} data-testid="erase-blocker">
        <strong>Bu hesap hâlâ giriş yapabiliyor; KVKK silmesi buradan yapılmaz.</strong>{" "}
        Kişiye uygulamadaki “Hesabımı sil” adımlarını iletin
        (www.rothern.com/hesap-silme); şifresini unuttuysa önce sıfırlasın.
        Şifreyle yapılan silme kimin istediğini kanıtlar, gelen bir e-posta
        kanıtlamaz.
      </p>
    );
  }
  if (preview.blocker === "ACCOUNT_COMPANY_SUSPENDED") {
    return (
      <p className={tone} data-testid="erase-blocker">
        <strong>Firma askıda ve bu kişi firmanın son kullanıcısı.</strong>{" "}
        Silme firmayı kapatır ve askı kaydının (sebep ve tarih) yerine
        “KVKK silme bekliyor” yazar. Önce askı kararını sonuçlandırın: askıyı
        kaldırın ya da şikâyet / inceleme kaydını koruyarak firmayı Özet ›
        “Kalıcı Olarak Sil / Anonimleştir” ile silin.
      </p>
    );
  }
  return (
    <p className={tone} data-testid="erase-blocker">
      <strong>Firma KVKK ile anonimleştirildi;</strong> silinecek kişisel veri
      kalmadı.
    </p>
  );
}

function PreviewBody({ preview }: { preview: AdminErasurePreview }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-admin-text-muted">Ad</dt>
        <dd className="min-w-0 break-words">{preview.name}</dd>
        <dt className="text-admin-text-muted">Kayıtlı e-posta</dt>
        <dd className="min-w-0 break-all">
          {preview.email ?? "— (kayıttan kaldırılmış)"}
        </dd>
        {preview.email ? null : (
          <>
            <dt className="text-admin-text-muted">Son kullandığı adres</dt>
            <dd className="min-w-0 break-all">
              {preview.lastKnownEmail ?? "Denetim kaydında yok"}
            </dd>
          </>
        )}
        {preview.removedAt ? (
          <>
            <dt className="text-admin-text-muted">Ekipten çıkarılma</dt>
            <dd>{safeFormat(preview.removedAt, "d MMM yyyy HH:mm")}</dd>
          </>
        ) : null}
      </dl>
      {preview.sameNameCount > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          Firmada aynı adı taşıyan {preview.sameNameCount} kayıt daha var: doğru
          kişi olduğunu adresle doğrulayın.
        </p>
      ) : null}
      <BlockerNotice preview={preview} />
      {!preview.blocker && preview.companySuspension ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          Firma askıda
          {preview.companySuspension.since
            ? ` (${safeFormat(preview.companySuspension.since, "d MMM yyyy")})`
            : ""}
          {preview.companySuspension.reason
            ? `: ${preview.companySuspension.reason}`
            : ""}
          . Askı kaydı silmeden etkilenmez.
        </p>
      ) : null}
      {preview.nothingLeft ? (
        <p>Bu kaydın adı, telefonu ve giriş bilgisi zaten silinmiş; silinecek bir şey kalmadı.</p>
      ) : preview.blocker ? null : (
        <>
          <p>
            Kişinin uygulamadaki “Hesabımı sil” işlemiyle aynıdır: giriş
            bilgileri, ad, soyad, telefon ve e-posta silinir; kayıt “Silinmiş
            Kullanıcı” adıyla kalır; bildirimleri, cihaz kayıtları ve AI
            sohbetleri silinir. <strong>Geri alınamaz.</strong>
          </p>
          {preview.closesCompany ? (
            <p>
              <strong>Firmanın son kullanıcısı:</strong> firma da kapanır ve
              “KVKK silme bekliyor” kuyruğuna girer; firma bilgileri en geç 30
              gün içinde Özet › “Kalıcı Olarak Sil / Anonimleştir” ile silinir.
            </p>
          ) : null}
          <p>
            <strong>Talebi doğrulayın:</strong> gelen e-postanın gönderen adresi
            tek başına kanıt değildir. kvkk@ adresinden{" "}
            {preview.email ? "kayıtlı adrese" : "yukarıdaki son kullanılan adrese"}{" "}
            yazın ve silme onayını o adresten bekleyin.
          </p>
        </>
      )}
    </>
  );
}

/** Kullanıcılar sekmesi › "KVKK: Hesabı Sil" / "KVKK: Kişisel Verileri Sil". */
export function EraseUserDialog({
  companyId,
  user,
  onClose,
}: {
  companyId: string;
  /** Açık pencerenin kişisi; null = kapalı. */
  user: AdminCompanyUser | null;
  onClose: () => void;
}) {
  const open = user !== null;
  const preview = useEraseUserPreview(companyId, user?.id ?? null);
  const erase = useEraseCompanyUser(companyId);
  const lock = useDialogSubmitLock(open);
  const data = preview.data;
  const canConfirm = !!data && !data.blocker && !data.nothingLeft;

  const confirm = () => {
    if (!user || !canConfirm) return;
    void lock
      .run(() =>
        erase.mutateAsync(user.id).then(
          (r) => {
            toast.success(
              r.companyClosed
                ? "Hesap silindi — firmanın son kullanıcısıydı, firma kapandı (KVKK silmesi bekliyor)"
                : "Hesap silindi",
            );
            onClose();
          },
          (e: unknown) => {
            const rule = eraseRuleMessage(e);
            // Önleyici (interceptor) API iletisini zaten bastı (400/409); aynı
            // kimlikle admin cümlesi onun YERİNE geçer — iki toast çıkmaz.
            if (rule) toast.error(rule, { id: apiErrorToastId(apiErrorMessage(e)) });
            else toastApiError(e);
          },
        ),
      )
      .catch(() => {});
  };

  return (
    <Dialog open={open} onClose={onClose} size="md" aria-label="KVKK silme talebi">
      <DialogTitle>KVKK silme talebi: hesabı sil</DialogTitle>
      <DialogBody>
        <div className="text-admin-text space-y-3 text-sm">
          {data ? (
            <PreviewBody preview={data} />
          ) : preview.isError ? (
            <div className="space-y-2">
              <p>Hesabın ön bilgisi alınamadı; silme yapılmadı.</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void preview.refetch()}>
                Tekrar dene
              </Button>
            </div>
          ) : (
            <p className="text-admin-text-muted" role="status">
              Hesap bilgisi yükleniyor…
            </p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!canConfirm || lock.locked}
          onClick={confirm}
        >
          Kalıcı Olarak Sil
        </Button>
      </DialogActions>
    </Dialog>
  );
}
