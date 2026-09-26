"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";
import { Iban } from "@/components/ui/iban";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import {
  useBankAccounts,
  useDeleteBankAccount,
  useSaveBankAccount,
  type CompanyBankAccount,
} from "@/hooks/use-company-bank-accounts";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ibanChecksumOk, isValidIbanTr, normalizeIban } from "@rothern/shared";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function BankAccountsSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("web.panel.settings.bankAccountsSection");
  const { data: accounts, isLoading, isError, refetch } = useBankAccounts();
  const del = useDeleteBankAccount();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<CompanyBankAccount | "new" | null>(
    null,
  );

  const handleDelete = async (a: CompanyBankAccount) => {
    const ok = await confirm({
      title: t("bankaHesabiSilinsinMi"),
      description: t("hesabiKaliciOlarakSilinecekMevcut", { title: a.title }),
      confirmLabel: t("sil"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(a.id);
      toast.success(t("bankaHesabiSilindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      {/* Başlık/açıklama SettingsShell'de — burada tekrar edilmez (2026-09-10). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="text-sm text-zinc-600">
          {t("kayitliHesaplarSiparisOnayindaSecilir")}
        </Text>
        {canManage ? (
          <Button onClick={() => setEditing("new")}>{t("hesapEkle")}</Button>
        ) : (
          <Text className="text-xs text-zinc-500">
            {t("bankaHesabiYalnizKurucuTarafindan")}
          </Text>
        )}
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">{t("yukleniyor")}</Text>
      ) : isError ? (
        <p role="alert" className="mt-3 text-sm text-rose-800">
          {t("bankaHesaplariYuklenemedi")}{" "}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
            {t("yenidenDene")}
          </button>
        </p>
      ) : !accounts || accounts.length === 0 ? (
        <Text className="mt-3 text-sm text-zinc-500">
          {t("henuzKayitliBankaHesabiYok")}
        </Text>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-lg border border-zinc-200 p-4">
              {/* C35/C36: başlık kendi satırında + ikon aksiyonlar (adres
                  kartlarıyla aynı düzen). */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className="min-w-0 truncate text-sm font-semibold text-zinc-900"
                  title={a.title}
                >
                  {a.title}
                </span>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      plain
                      aria-label={t("duzenle")}
                      title={t("duzenle")}
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="h-4 w-4 text-zinc-500" />
                    </Button>
                    <Button
                      plain
                      aria-label={t("sil")}
                      title={t("sil")}
                      onClick={() => handleDelete(a)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {a.isDefault ? (
                <div className="mt-1.5">
                  <Badge color="amber">{t("varsayilan")}</Badge>
                </div>
              ) : null}
              <div className="mt-1.5 text-xs text-zinc-600">
                <Iban value={a.iban} />
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {a.accountHolder}
                {a.bankName ? ` · ${a.bankName}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <BankAccountModal
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function BankAccountModal({
  account,
  onClose,
}: {
  account: CompanyBankAccount | null;
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.settings.bankAccountsSection");
  const save = useSaveBankAccount();
  const [title, setTitle] = useState(account?.title ?? "");
  const [holder, setHolder] = useState(account?.accountHolder ?? "");
  const [iban, setIban] = useState(account?.iban ?? "");
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);

  // IBAN doğrulaması — backend company-bank-accounts.service ile BİREBİR:
  // TR katı (isValidIbanTr), yabancı IBAN da mod-97 (`ibanChecksumOk`, Dalga
  // B P3). Web eskiden yabancıda yalnız biçime bakıyordu; tek hane hatalı
  // DE/NL IBAN'ı geçirip sunucudan 400 alıyordu.
  const ibanClean = normalizeIban(iban);
  const ibanInvalid =
    ibanClean.length > 0 &&
    (ibanClean.startsWith("TR")
      ? !isValidIbanTr(ibanClean)
      : !/^[A-Z]{2}[0-9A-Z]{8,32}$/.test(ibanClean) || !ibanChecksumOk(ibanClean));
  const ibanError = ibanInvalid
    ? ibanClean.startsWith("TR")
      ? t("gecerliBirTrIbanGirin")
      : t("gecerliBirIbanGirinKontrol")
    : null;

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: account?.id,
        title: title.trim(),
        accountHolder: holder.trim(),
        iban: ibanClean,
        bankName: bankName.trim() || undefined,
        isDefault,
      });
      toast.success(account ? t("hesapGuncellendi") : t("hesapEklendi"));
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  const valid = title.trim() && holder.trim() && ibanClean && !ibanInvalid;

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>
        {account ? t("hesabiDuzenle") : t("yeniBankaHesabi")}
      </DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>{t("hesapBasligi")}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("ornTlVadesizIsBankasi")}
            maxLength={120}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>{t("hesapSahibi")}</Label>
            <Input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder={t("firmaUnvani")}
              maxLength={140}
            />
            <Text className="mt-1 text-xs text-zinc-500">
              {t("vergiLevhasindakiUnvanlaAyniOlmali")}
            </Text>
          </Field>
          <Field>
            <Label>{t("bankaAdi")}</Label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t("opsiyonel")}
              maxLength={120}
            />
          </Field>
        </div>
        <Field>
          <Label>{t("iban")}</Label>
          <Input
            value={iban}
            invalid={Boolean(ibanError)}
            onChange={(e) => setIban(e.target.value)}
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            maxLength={40}
            className="tabular-nums"
          />
          {ibanError ? <ErrorMessage>{ibanError}</ErrorMessage> : null}
        </Field>
        <CheckboxField>
          <Checkbox checked={isDefault} onChange={setIsDefault} />
          <Label>{t("varsayilanHesapSiparisOnayindaOn")}</Label>
        </CheckboxField>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button onClick={submit} disabled={save.isPending || !valid}>
          {save.isPending ? t("kaydediliyor") : t("kaydet")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
