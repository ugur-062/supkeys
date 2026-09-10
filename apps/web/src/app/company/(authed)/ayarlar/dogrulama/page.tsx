"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import {
  docLabels,
  useCompanyDocs,
  useSubmitDocs,
  useUploadDoc,
  type DocKind,
} from "@/hooks/use-company-docs";
import { isKycLocked, VERIFICATION_STATUS } from "@/lib/company/verification-status";
import { extractErrorMessage } from "@/lib/tenders/error";
import { MissingFields } from "@/components/ui/missing-fields";
import { isValidIbanTr, normalizeIban } from "@rothern/shared";
import { Check, FileText, Lock, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function DogrulamaPage() {
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
      toast.error(`"${file.name}" 50MB sınırını aşıyor`);
      return;
    }
    setBusyKind(kind);
    try {
      await upload.mutateAsync({ kind, file });
      toast.success(
        data?.status === "VERIFIED"
          ? "Belge incelemeye gönderildi"
          : "Belge yüklendi",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
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
      toast.success("Belgeler doğrulamaya gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gönderilemedi"));
    }
  };

  const labels = data ? docLabels(data.country, data.required) : [];
  // EKSİKLER — kullanıcı "Gönder" neden kapalı görsün (2026-09-10). IBAN
  // denetimi Banka Hesapları ile AYNI tek kaynak (mod-97), ayrı regex değil.
  // Satır içi hatalar — backend submit() ile AYNI: MERSİS 16 hane, IBAN mod-97.
  const mersisError =
    isTR && mersisNo.trim() && !/^\d{16}$/.test(mersisNo.trim())
      ? "MERSİS No 16 haneli olmalı"
      : null;
  const ibanError =
    isTR && normalizeIban(iban) && !isValidIbanTr(normalizeIban(iban))
      ? "Geçerli bir TR IBAN girin — kontrol hanesi tutmuyor"
      : null;
  const missing: string[] = [
    ...labels.filter((d) => data && !data.docs[d.key]).map((d) => d.label),
    ...(isTR
      ? [
          ...(/^\d{16}$/.test(mersisNo.trim()) ? [] : ["MERSİS No (16 hane)"]),
          ...(tradeRegistryNo.trim() ? [] : ["Ticari Sicil No"]),
          ...(isValidIbanTr(normalizeIban(iban)) ? [] : ["Geçerli IBAN"]),
          ...(ibanHolder.trim() ? [] : ["IBAN hesap sahibi"]),
        ]
      : []),
  ];
  const canSubmit = !!data && missing.length === 0 && !locked;

  return (
    <SettingsShell
      page={SETTINGS_PAGES.dogrulama}
      description="Belgeleriniz ekibimizce elle incelenir. Doğrulanan firma herkese açık taleplere teklif verebilir, talep yayımlayabilir ve pakete geçebilir; profilinde “Doğrulanmış” rozeti görünür. Doğrulanmamış firma alıcıya “Doğrulanmamış firma” olarak görünür."
    >
      {isLoading || !data ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Text className="text-sm text-zinc-500">Durum:</Text>
            <Badge color={VERIFICATION_STATUS[data.status].color}>
              {VERIFICATION_STATUS[data.status].label}
            </Badge>
          </div>

          {/* Red — reddedilince gösterilir. Belge bazlı: yalnız işaretli
              belgeler yeniden yüklenir, onaylananlar kilitli kalır. */}
          {data.status === "REJECTED" ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p className="font-semibold">Bazı belgeler reddedildi</p>
              <p className="mt-0.5">
                {data.rejectionReason ||
                  "Aşağıda “Reddedildi” işaretli belgeleri düzeltip yeniden yükleyin, ardından tekrar gönderin. Onaylanan belgeleri yeniden yüklemenize gerek yok."}
              </p>
            </div>
          ) : data.status === "PENDING" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Belge ve bilgileriniz inceleniyor — sonuç bildirilecektir. İnceleme
              sürerken değişiklik yapılamaz.
            </div>
          ) : data.status === "VERIFIED" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Firmanız doğrulandı. Herkese açık taleplere teklif, talep yayını ve paket geçişi açık.
              {canManage ? (
                <span className="mt-0.5 block text-xs text-emerald-700">
                  Onaylanan belgeler değiştirilemez; bir belge reddedilirse
                  yalnız o belgeyi yeniden yükleyebilirsiniz.
                </span>
              ) : null}
            </div>
          ) : null}

          {/* ── Kimlik bilgileri — TR'ye özgü alanlar (MERSİS) yabancıda gizli;
              yabancıda tüm alanlar opsiyonel (admin manuel KYB yapar). ── */}
          <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Doğrulama Bilgileri{isTR ? "" : " (opsiyonel)"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {!isTR
                    ? "Yurt dışı firmalarda bu alanlar zorunlu değildir; doğrulama yüklediğiniz belgelere göre elle yapılır."
                    : locked
                      ? data.status === "PENDING"
                        ? "İnceleme sürerken bu bilgiler değiştirilemez."
                        : "Bu bilgiler belgelerle doğrulandı; değişiklik için destek ile iletişime geçin."
                      : "Belgelerdeki bilgilerle birebir aynı olmalı; gönderdikten sonra kilitlenir."}
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
                  <Label>MERSİS No *</Label>
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
                  {isTR ? "Ticari Sicil No *" : "Sicil / Kayıt No"}
                </Label>
                <Input
                  value={tradeRegistryNo}
                  onChange={(e) => setTradeRegistryNo(e.target.value)}
                  placeholder={isTR ? "123456" : "Registration / Company No"}
                  disabled={!canManage || locked}
                  maxLength={30}
                />
              </Field>
              <Field>
                <Label>{isTR ? "IBAN *" : "IBAN / Hesap No"}</Label>
                <Input
                  value={iban}
                  invalid={Boolean(ibanError)}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder={
                    isTR
                      ? "TR00 0000 0000 0000 0000 0000 00"
                      : "IBAN veya banka hesap no"
                  }
                  disabled={!canManage || locked}
                  maxLength={40}
                  className="tabular-nums"
                />
                {ibanError ? (
                  <ErrorMessage>{ibanError}</ErrorMessage>
                ) : (
                  <Text className="mt-1 text-xs text-zinc-500">
                    Doğrulama içindir. Sipariş tahsilat hesapları{" "}
                    <Link href="/company/ayarlar/banka-hesaplari" className="font-semibold underline">
                      Banka Hesapları
                    </Link>
                    nda.
                  </Text>
                )}
              </Field>
              <Field>
                <Label>{isTR ? "IBAN Hesap Sahibi *" : "Hesap Sahibi"}</Label>
                <Input
                  value={ibanHolder}
                  onChange={(e) => setIbanHolder(e.target.value)}
                  placeholder={isTR ? "Firma Unvanı A.Ş." : "Firma unvanı"}
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
                            <Check className="h-3.5 w-3.5" /> Onaylandı
                          </span>
                        ) : showStatus && st === "REJECTED" ? (
                          <span className="text-xs font-medium text-red-600">
                            Reddedildi
                          </span>
                        ) : showStatus && st === "PENDING" ? (
                          <span className="text-xs text-amber-600">
                            İnceleniyor
                          </span>
                        ) : url ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <Check className="h-3.5 w-3.5" /> Yüklendi
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">Eksik</span>
                        )}
                        {rev?.status === "PENDING" ? (
                          <span className="text-xs font-medium text-amber-600">
                            Yeni belge incelemede
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
                            Görüntüle
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
                                ? "Yükleniyor…"
                                : url
                                  ? "Değiştir"
                                  : "Yükle"}
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
                        Belge güncellemeniz reddedildi
                        {rev.reason ? `: ${rev.reason}` : ""} — mevcut belgeniz
                        geçerliliğini koruyor.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {!canManage ? (
            <Text className="text-sm text-zinc-500">
              Belgeleri yalnızca firma sahibi ya da Yönetici rolündeki
              kullanıcılar yükleyebilir.
            </Text>
          ) : !locked ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-xs text-zinc-500">
                {missing.length > 0 ? (
                  <MissingFields label="Göndermek için eksik" items={missing} />
                ) : (
                  <Text className="text-xs text-zinc-500">
                    Her şey tamam. Gönderdikten sonra inceleme bitene kadar değişiklik yapılamaz.
                  </Text>
                )}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submit.isPending}
              >
                {submit.isPending ? "Gönderiliyor…" : "Doğrulamaya Gönder"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SettingsShell>
  );
}
