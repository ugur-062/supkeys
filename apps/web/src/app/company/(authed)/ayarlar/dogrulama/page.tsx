"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import {
  docLabels,
  useCompanyDocs,
  useSubmitDocs,
  useUploadDoc,
  type DocKind,
  type VerificationStatus,
} from "@/hooks/use-company-docs";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsShell } from "../_components/settings-shell";

const STATUS_META: Record<
  VerificationStatus,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  UNVERIFIED: { label: "Doğrulanmamış", color: "zinc" },
  PENDING: { label: "Onay bekliyor", color: "amber" },
  VERIFIED: { label: "Doğrulanmış", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

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
  const locked = data?.status === "PENDING" || data?.status === "VERIFIED";
  const isTR = (data?.country ?? "TR").toUpperCase() === "TR";
  // Belge bazlı kilit: onaylanan belge her durumda kilitli; genel REJECTED iken
  // yalnız onaylı OLMAYAN (reddedilen/bekleyen) belgeler yeniden yüklenebilir.
  const docEditable = (k: DocKind) => {
    if (!data) return false;
    if (data.status === "UNVERIFIED") return true;
    if (data.status === "REJECTED") return data.docStatus[k] !== "APPROVED";
    return false; // PENDING / VERIFIED
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
      toast.success("Belge yüklendi");
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
        iban: iban.replace(/\s+/g, "").toUpperCase(),
        ibanHolder: ibanHolder.trim(),
      });
      toast.success("Belgeler doğrulamaya gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gönderilemedi"));
    }
  };

  const labels = data ? docLabels(data.country, data.required) : [];
  const allUploaded = !!data && labels.every((d) => data.docs[d.key]);
  // TR'de kimlik alanları da zorunlu; yabancıda opsiyonel.
  const kycComplete =
    !isTR ||
    (mersisNo.trim().length >= 10 &&
      tradeRegistryNo.trim().length > 0 &&
      /^TR\d{24}$/.test(iban.replace(/\s+/g, "").toUpperCase()) &&
      ibanHolder.trim().length > 0);
  const canSubmit = allUploaded && kycComplete && !locked;

  return (
    <SettingsShell
      title="Doğrulama Belgeleri"
      description="Firma doğrulaması için gerekli belge ve bilgileri girin. Premium (PAKET) üyelik için doğrulama zorunludur."
    >
      {isLoading || !data ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Text className="text-sm text-zinc-500">Durum:</Text>
            <Badge color={STATUS_META[data.status].color}>
              {STATUS_META[data.status].label}
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
              Firmanız doğrulandı. Premium özellikleri kullanabilirsiniz.
            </div>
          ) : null}

          {/* ── Kimlik bilgileri (MERSİS / Ticari Sicil / IBAN) ── */}
          <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">
              Firma Kimlik Bilgileri
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field>
                <Label>MERSİS No {isTR ? "*" : ""}</Label>
                <Input
                  value={mersisNo}
                  onChange={(e) => setMersisNo(e.target.value)}
                  placeholder="0000000000000000"
                  disabled={!canManage || locked}
                  maxLength={20}
                />
              </Field>
              <Field>
                <Label>Ticari Sicil No {isTR ? "*" : ""}</Label>
                <Input
                  value={tradeRegistryNo}
                  onChange={(e) => setTradeRegistryNo(e.target.value)}
                  placeholder="123456"
                  disabled={!canManage || locked}
                  maxLength={30}
                />
              </Field>
              <Field>
                <Label>IBAN {isTR ? "*" : ""}</Label>
                <Input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  disabled={!canManage || locked}
                  maxLength={40}
                />
              </Field>
              <Field>
                <Label>IBAN Hesap Sahibi {isTR ? "*" : ""}</Label>
                <Input
                  value={ibanHolder}
                  onChange={(e) => setIbanHolder(e.target.value)}
                  placeholder="Firma Ünvanı A.Ş."
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
                // Belge durum rozeti — genel PENDING/VERIFIED/REJECTED'de anlamlı.
                const showStatus = data.status !== "UNVERIFIED";
                return (
                  <li
                    key={d.key}
                    className="flex flex-col gap-1.5 px-4 py-3"
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
                          <span className="text-xs text-zinc-400">Eksik</span>
                        )}
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
            <div className="flex items-center justify-between gap-3">
              <Text className="text-xs text-zinc-400">
                Tüm belgeler ve kimlik bilgileri tamamlanınca gönderebilirsiniz.
                Gönderdikten sonra inceleme bitene kadar değişiklik yapılamaz.
              </Text>
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
