"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import {
  useApproveCompanyVerification,
  useCompanyVerificationDetail,
  useCompanyVerifications,
  useRejectCompanyVerification,
} from "@/hooks/use-company-verifications";
import type {
  CompanyVerificationListItem,
  OwnerType,
  VerificationStatus,
} from "@/lib/company-verifications/types";
import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DOC_LABELS: Record<string, string> = {
  TAX_PLATE: "Vergi Levhası",
  TRADE_REGISTRY: "Ticaret Sicil Gazetesi",
  SIGNATURE_CIRCULAR: "İmza Sirküleri",
  ACTIVITY_CERT: "Faaliyet Belgesi",
  ID_FRONT: "Yetkili Kimlik - Ön",
  ID_BACK: "Yetkili Kimlik - Arka",
};

const STATUS: Record<
  VerificationStatus,
  { label: string; color: "zinc" | "amber" | "green" | "red" }
> = {
  UNVERIFIED: { label: "Doğrulanmadı", color: "zinc" },
  PENDING: { label: "İnceleniyor", color: "amber" },
  VERIFIED: { label: "Doğrulandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

const FILTERS: { value: string; label: string }[] = [
  { value: "PENDING", label: "İnceleniyor" },
  { value: "VERIFIED", label: "Doğrulandı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "ALL", label: "Tümü" },
];

export function CompanyVerificationsView() {
  const [status, setStatus] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{
    ownerType: OwnerType;
    id: string;
  } | null>(null);

  const list = useCompanyVerifications(status, search);

  return (
    <RequireAdminAuth>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-bold text-zinc-900">Firma Doğrulamaları</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Yüklenen belgeleri inceleyip firma doğrulamasını onaylayın veya
          reddedin.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                status === f.value
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma ara…"
            className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {list.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : !list.data || list.data.items.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Kayıt bulunamadı.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {list.data.items.map((item) => (
                <Row
                  key={`${item.ownerType}-${item.id}`}
                  item={item}
                  onOpen={() =>
                    setSelected({ ownerType: item.ownerType, id: item.id })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {selected ? (
        <DetailDialog
          ownerType={selected.ownerType}
          id={selected.id}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </RequireAdminAuth>
  );
}

function Row({
  item,
  onOpen,
}: {
  item: CompanyVerificationListItem;
  onOpen: () => void;
}) {
  const s = STATUS[item.status];
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-900">{item.name}</p>
        <p className="text-xs text-zinc-500">
          {item.ownerType === "tenant" ? "Alıcı" : "Tedarikçi"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge color={s.color}>{s.label}</Badge>
        <Button variant="secondary" size="sm" onClick={onOpen}>
          İncele
        </Button>
      </div>
    </li>
  );
}

function DetailDialog({
  ownerType,
  id,
  onClose,
}: {
  ownerType: OwnerType;
  id: string;
  onClose: () => void;
}) {
  const detail = useCompanyVerificationDetail(ownerType, id);
  const approve = useApproveCompanyVerification();
  const reject = useRejectCompanyVerification();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const d = detail.data;

  const onApprove = () =>
    approve.mutate(
      { ownerType, id },
      {
        onSuccess: () => {
          toast.success("Firma doğrulandı");
          onClose();
        },
        onError: () => toast.error("Onaylanamadı"),
      },
    );

  const onReject = () => {
    if (reason.trim().length < 5) {
      toast.error("Gerekçe en az 5 karakter olmalı");
      return;
    }
    reject.mutate(
      { ownerType, id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Firma doğrulaması reddedildi");
          onClose();
        },
        onError: () => toast.error("İşlem başarısız"),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>{d?.name ?? "Firma Doğrulama"}</DialogTitle>
      <DialogDescription>
        {ownerType === "tenant" ? "Alıcı" : "Tedarikçi"} firma doğrulama
        incelemesi
      </DialogDescription>
      <DialogBody>
        {detail.isLoading || !d ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Fact k="Yasal Ünvan" v={d.legalName} />
              <Fact k="Vergi No" v={d.taxNumber} />
              <Fact k="Vergi Dairesi" v={d.taxOffice} />
              <Fact k="MERSİS" v={d.mersisNo} />
              <Fact k="Ticaret Sicil" v={d.tradeRegistryNo} />
              <Fact k="KEP" v={d.kepAddress} />
              <Fact k="IBAN" v={d.iban} />
              <Fact k="IBAN Sahibi" v={d.ibanHolder} />
              <Fact k="Yetkili TCKN" v={d.authorizedTckn} />
              <Fact k="Yetkili Ünvanı" v={d.authorizedTitle} />
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                Belgeler
              </h3>
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {d.docs.map((doc) => (
                  <li
                    key={doc.docType}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-700">
                      {DOC_LABELS[doc.docType] ?? doc.docType}
                    </span>
                    {doc.uploaded && doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:underline"
                      >
                        Görüntüle <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-rose-600">Eksik</span>
                    )}
                  </li>
                ))}
              </ul>
              {!d.allUploaded ? (
                <p className="mt-2 text-xs text-amber-700">
                  Tüm belgeler yüklenmeden onaylanamaz.
                </p>
              ) : null}
            </div>

            {rejecting ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Red gerekçesi
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Eksik/hatalı belge açıklaması…"
                />
              </div>
            ) : null}
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Kapat
        </Button>
        {rejecting ? (
          <Button
            variant="danger"
            onClick={onReject}
            loading={reject.isPending}
          >
            Reddet
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Reddet
            </Button>
            <Button
              onClick={onApprove}
              loading={approve.isPending}
              disabled={!d?.allUploaded || approve.isPending}
            >
              Onayla
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function Fact({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-zinc-500">{k}</dt>
      <dd className="font-medium text-zinc-900">{v || "—"}</dd>
    </div>
  );
}
