"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import {
  useCompanyDocs,
  useDocLabels,
  useSubmitDocs,
  useUploadDoc,
  type DocKind,
} from "@/hooks/use-company-docs";
import { isKycLocked, useVerificationMeta } from "@/lib/company/verification-status";
import { extractErrorMessage } from "@/lib/tenders/error";
import { MissingFields } from "@/components/ui/missing-fields";
import {
  getCountryProfile,
  ibanChecksumOk,
  isValidIbanTr,
  normalizeIban,
} from "@rothern/shared";
import { Check, FileText, Lock, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function DogrulamaPage() {
  const t = useTranslations("web.panel.settings.ayarlarDogrulamaPage");
  const docLabels = useDocLabels();
  const verificationMeta = useVerificationMeta();
  // Backend upload/submit uçları company:manage ister — diğer roller
  // yalnızca durumu görür (efektif izin: rol + sahip + override).
  const canManage = useHasCompanyPermission("company:manage");
  const { data, isLoading } = useCompanyDocs();
  const upload = useUploadDoc();
  const submit = useSubmitDocs();
  const [busyKind, setBusyKind] = useState<DocKind | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // KYC kimlik alanları — data gelince ön-doldurulur.
  const [mersisNo, setMersisNo] = useState("");
  const [tradeRegistryNo, setTradeRegistryNo] = useState("");
  const [iban, setIban] = useState("");
  const [ibanHolder, setIbanHolder] = useState("");
  useEffect(() => {
    if (!data) return;
    setMersisNo(data.mersisNo ?? "");
    setTradeRegistryNo(data.tradeRegistryNo ?? "");
    setIban(data.iban ?? "");
    setIbanHolder(data.ibanHolder ?? "");
  }, [data]);

  // Gönderildikten sonra (PENDING) veya onaylandıktan sonra (VERIFIED) kilitli;
  // yalnız REJECTED/UNVERIFIED'de (kimlik alanları) düzenlenebilir.
  const locked = isKycLocked(data?.status);
  const isTR = (data?.country ?? "TR").toUpperCase() === "TR";
  // ÜLKEYE GÖRE BİÇİM, HERKESE ZORUNLU (2026-09-14, kullanıcı kararı).
  // Ekran eskiden "yurt dışı firmalarda bu alanlar zorunlu değildir" diyordu —
  // yurt içi/yurt dışı ayrımı yanlıştı: her ülke firmaya kayıt numarası verir
  // ve sicil BELGESİNİ zaten sekizinde de istiyoruz. Değişen yalnız biçim:
  // MERSİS Türkiye'ye özgü (başka ülkede YOK, "opsiyonel" değil), banka bilgisi
  // IBAN kullanan ülkede mod-97 doğrulanır, kullanmayanda hesap numarasıdır.
  const usesIban = getCountryProfile(data?.country ?? "TR")?.usesIban ?? true;
  const bankaEtiketi = usesIban ? "IBAN" : t("bankaHesapNo");
  // Belge bazlı kilit (backend commit() ile birebir): ONAYLANAN BELGE KALICI —
  // hiçbir durumda değiştirilemez; yeniden yükleme yalnız o belge reddedildiyse
  // (veya hiç yüklenmediyse) mümkün. İnceleme sürerken (PENDING) hepsi kilitli.
  // VERIFIED'da onaylı olmayan alan (boş opsiyonel belge) revizyon akışına düşer.
  const docEditable = (k: DocKind) => {
    if (!data) return false;
    if (data.status === "PENDING") return false;
    return data.docStatus[k] !== "APPROVED";
  };

  const handleFile = async (kind: DocKind, file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("n50mbSiniriniAsiyor", { name: file.name }));
      return;
    }
    setBusyKind(kind);
    try {
      await upload.mutateAsync({ kind, file });
      toast.success(
        data?.status === "VERIFIED"
          ? t("belgeIncelemeyeGonderildi")
          : t("belgeYuklendi"),
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, t("yuklenemedi")));
    } finally {
      setBusyKind(null);
    }
  };

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync({
        mersisNo: mersisNo.trim(),
        tradeRegistryNo: tradeRegistryNo.trim(),
        iban: normalizeIban(iban),
        ibanHolder: ibanHolder.trim(),
      });
      toast.success(t("belgelerDogrulamayaGonderildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("gonderilemedi")));
    }
  };

  const labels = data ? docLabels(data.country, data.required) : [];
  // EKSİKLER — kullanıcı "Gönder" neden kapalı görsün (2026-09-10). IBAN
  // denetimi Banka Hesapları ile AYNI tek kaynak (mod-97), ayrı regex değil.
  // Satır içi hatalar — backend submit() ile AYNI: MERSİS 16 hane, IBAN mod-97.
  const mersisError =
    isTR && mersisNo.trim() && !/^\d{16}$/.test(mersisNo.trim())
      ? t("mersisNo16HaneliOlmali")
      : null;
  const ibanGecerli = (v: string) => {
    const n = normalizeIban(v);
    if (!n) return false;
    if (!usesIban) return true; // serbest biçim (RU/UZ/CN hesap numarası)
    return isTR ? isValidIbanTr(n) : ibanChecksumOk(n);
  };
  const ibanError =
    usesIban && normalizeIban(iban) && !ibanGecerli(iban)
      ? t("gecerliBirIbanGirinKontrol")
      : null;
  const missing: string[] = [
    ...labels.filter((d) => data && !data.docs[d.key]).map((d) => d.label),
    // MERSİS yalnız TR — başka ülkede karşılığı yok.
    ...(isTR && !/^\d{16}$/.test(mersisNo.trim())
      ? [t("mersisNo16Hane")]
      : []),
    ...(tradeRegistryNo.trim() ? [] : [isTR ? t("ticariSicilNo2") : t("sicilKayitNo")]),
    ...(ibanGecerli(iban) ? [] : [usesIban ? t("gecerliIban") : t("bankaHesapNo")]),
    ...(ibanHolder.trim() ? [] : [t("hesapSahibi2")]),
  ];
  const canSubmit = !!data && missing.length === 0 && !locked;

  return (
    <SettingsShell
      page={SETTINGS_PAGES.dogrulama}
      description={t("dogrulamaUcretsizVePaketGerektirmez")}
    >
      {isLoading || !data ? (
        <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Text className="text-sm text-zinc-500">{t("durum")}</Text>
            <Badge color={verificationMeta(data.status).color}>
              {verificationMeta(data.status).label}
            </Badge>
          </div>

          {/* Red — reddedilince gösterilir. Belge bazlı: yalnız işaretli
              belgeler yeniden yüklenir, onaylananlar kilitli kalır. */}
          {data.status === "REJECTED" ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p className="font-semibold">{t("baziBelgelerReddedildi")}</p>
              <p className="mt-0.5">
                {data.rejectionReason ||
                  t("asagidaReddedildiIsaretliBelgeleriDuzeltip")}
              </p>
            </div>
          ) : data.status === "PENDING" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("belgeVeBilgilerinizInceleniyorSonuc")}
            </div>
          ) : data.status === "VERIFIED" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {t("firmanizDogrulandiHerkeseAcik")}
              {canManage ? (
                <span className="mt-0.5 block text-xs text-emerald-700">
                  {t("onaylananBelgelerDegistirilemezBirBelge")}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* ── Kimlik bilgileri — HEPSİ ZORUNLU, biçim ülkeye göre.
              MERSİS yalnız TR'de ÇİZİLİR (başka ülkede karşılığı yok);
              banka alanı IBAN ülkelerinde mod-97 doğrulanır, diğerlerinde
              (RU/UZ/CN) serbest biçimli hesap numarasıdır. ── */}
          <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {t("dogrulamaBilgileri")}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {locked
                    ? data.status === "PENDING"
                      ? t("incelemeSurerkenBuBilgilerDegistirilemez")
                      : t("buBilgilerBelgelerleDogrulandiDegisiklik")
                    : t("belgelerdekiBilgilerleBirebirAyniOlmali")}
                </p>
              </div>
              {locked ? (
                <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              ) : null}
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {/* MERSİS yalnızca Türkiye'de vardır — yabancıda gösterilmez. */}
              {isTR ? (
                <Field>
                  <Label>{t("mersisNo")}</Label>
                  <Input
                    value={mersisNo}
                    invalid={Boolean(mersisError)}
                    onChange={(e) => setMersisNo(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000000000000000"
                    disabled={!canManage || locked}
                    maxLength={16}
                    className="tabular-nums"
                  />
                  {mersisError ? <ErrorMessage>{mersisError}</ErrorMessage> : null}
                </Field>
              ) : null}
              <Field>
                <Label>
                  {isTR ? t("ticariSicilNo") : t("sicilKayitNo2")}
                </Label>
                <Input
                  value={tradeRegistryNo}
                  onChange={(e) => setTradeRegistryNo(e.target.value)}
                  placeholder={isTR ? "123456" : t("registrationCompanyNo")}
                  disabled={!canManage || locked}
                  maxLength={30}
                />
              </Field>
              <Field>
                <Label>{bankaEtiketi} *</Label>
                <Input
                  value={iban}
                  invalid={Boolean(ibanError)}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder={
                    isTR
                      ? "TR00 0000 0000 0000 0000 0000 00"
                      : t("ibanVeyaBankaHesapNo")
                  }
                  disabled={!canManage || locked}
                  maxLength={40}
                  className="tabular-nums"
                />
                {ibanError ? (
                  <ErrorMessage>{ibanError}</ErrorMessage>
                ) : (
                  <Text className="mt-1 text-xs text-zinc-500">
                    {t.rich("dogrulamaIcindirSiparisTahsilat", {
                      banka: (c) => (
                        <Link href="/company/ayarlar/banka-hesaplari" className="font-semibold underline">
                          {c}
                        </Link>
                      ),
                    })}
                  </Text>
                )}
              </Field>
              <Field>
                <Label>{t("hesapSahibi")}</Label>
                <Input
                  value={ibanHolder}
                  onChange={(e) => setIbanHolder(e.target.value)}
                  placeholder={isTR ? t("firmaUnvaniAS") : t("firmaUnvani")}
                  disabled={!canManage || locked}
                  maxLength={120}
                />
              </Field>
            </div>
          </div>

          {/* ── Belgeler ── */}
          <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
            <ul className="divide-y divide-zinc-100">
              {labels.map((d) => {
                const url = data.docs[d.key];
                const isBusy = busyKind === d.key;
                const st = data.docStatus[d.key];
                const editable = canManage && docEditable(d.key);
                // Faz Y: VERIFIED-sonrası güncelleme revizyonu (bekleyen/reddedilen).
                const rev =
                  data.status === "VERIFIED" ? data.revisions?.[d.key] : null;
                // Belge durum rozeti — genel PENDING/VERIFIED/REJECTED'de anlamlı.
                const showStatus = data.status !== "UNVERIFIED";
                return (
                  <li
                    key={d.key}
                    className="flex flex-col gap-2 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                        <span className="text-sm text-zinc-900">{d.label}</span>
                        {showStatus && st === "APPROVED" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <Check className="h-3.5 w-3.5" /> {t("onaylandi")}
                          </span>
                        ) : showStatus && st === "REJECTED" ? (
                          <span className="text-xs font-medium text-red-600">
                            {t("reddedildi")}
                          </span>
                        ) : showStatus && st === "PENDING" ? (
                          <span className="text-xs text-amber-600">
                            {t("inceleniyor")}
                          </span>
                        ) : url ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <Check className="h-3.5 w-3.5" /> {t("yuklendi")}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">{t("eksik")}</span>
                        )}
                        {rev?.status === "PENDING" ? (
                          <span className="text-xs font-medium text-amber-600">
                            {t("yeniBelgeIncelemede")}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {t("goruntule")}
                          </a>
                        ) : null}
                        {editable ? (
                          <>
                            <Button
                              plain
                              onClick={() => inputs.current[d.key]?.click()}
                              disabled={isBusy}
                            >
                              <Upload className="h-4 w-4" />
                              {isBusy
                                ? t("yukleniyor")
                                : url
                                  ? t("degistir")
                                  : t("yukle")}
                            </Button>
                            <input
                              ref={(el) => {
                                inputs.current[d.key] = el;
                              }}
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,.webp"
                              className="hidden"
                              onChange={(e) => {
                                handleFile(d.key, e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                    {/* Belge bazlı red gerekçesi — kullanıcı ne düzelteceğini bilir. */}
                    {st === "REJECTED" && data.docReason[d.key] ? (
                      <p className="pl-6 text-xs text-red-600">
                        {data.docReason[d.key]}
                      </p>
                    ) : null}
                    {/* Faz Y: reddedilen güncelleme — mevcut belge geçerli kalır. */}
                    {rev?.status === "REJECTED" ? (
                      <p className="pl-6 text-xs text-red-600">
                        {rev.reason
                          ? t("belgeGuncellemenizReddedildiGerekce", { reason: rev.reason })
                          : t("belgeGuncellemenizReddedildi")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {!canManage ? (
            <Text className="text-sm text-zinc-500">
              {t("belgeleriYalnizcaFirmaSahibiYa")}
            </Text>
          ) : !locked ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-xs text-zinc-500">
                {missing.length > 0 ? (
                  <MissingFields label={t("gondermekIcinEksik")} items={missing} />
                ) : (
                  <Text className="text-xs text-zinc-500">
                    {t("herSeyTamamGonderdiktenSonra")}
                  </Text>
                )}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submit.isPending}
              >
                {submit.isPending ? t("gonderiliyor") : t("dogrulamayaGonder")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsShell>
  );
}
