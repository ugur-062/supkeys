"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Divider } from "@/components/catalyst/divider";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
} from "@/lib/tenders/labels";
import type {
  SupplierTenderDetail,
  TenderAddressSnapshot,
} from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, XCircle } from "lucide-react";

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

function RuleItem({ active, label }: { active: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {active ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-zinc-300" />
      )}
      <span className={active ? "text-zinc-900" : "text-zinc-400"}>
        {label}
      </span>
    </li>
  );
}

export function SupplierGeneralInfoTab({
  tender,
}: {
  tender: SupplierTenderDetail;
}) {
  return (
    <div>
      {tender.isLogistics && tender.logisticsDetails ? (
        <div className="mb-8">
          <LogisticsInfoCard details={tender.logisticsDetails} />
        </div>
      ) : null}

      {/* Süreç */}
      <Subheading>Süreç</Subheading>
      <DescriptionList className="mt-4">
        {tender.categories && tender.categories.length > 0 ? (
          <>
            <DescriptionTerm>
              {tender.categories.length > 1 ? "Kategoriler" : "Kategori"}
            </DescriptionTerm>
            <DescriptionDetails>
              <ul className="space-y-0.5">
                {tender.categories.map((c) => (
                  <li key={c.id} className="font-medium text-zinc-900">
                    {c.breadcrumb}
                  </li>
                ))}
              </ul>
            </DescriptionDetails>
          </>
        ) : null}
        <DescriptionTerm>Yayın Tarihi</DescriptionTerm>
        <DescriptionDetails>{fmt(tender.publishedAt)}</DescriptionDetails>
        <DescriptionTerm>Teklif Açılış</DescriptionTerm>
        <DescriptionDetails>{fmt(tender.bidsOpenAt)}</DescriptionDetails>
        <DescriptionTerm>Teklif Kapanış</DescriptionTerm>
        <DescriptionDetails>{fmt(tender.bidsCloseAt)}</DescriptionDetails>
        <DescriptionTerm>Para Birimi</DescriptionTerm>
        <DescriptionDetails>
          <Badge>
            {tender.primaryCurrency} {CURRENCY_SYMBOL[tender.primaryCurrency]}
          </Badge>
        </DescriptionDetails>
      </DescriptionList>

      <Divider className="my-8" />

      {/* Teslim & Ödeme */}
      <Subheading>Teslim &amp; Ödeme</Subheading>
      <DescriptionList className="mt-4">
        <DescriptionTerm>Teslim Şekli</DescriptionTerm>
        <DescriptionDetails>
          {tender.deliveryTerm
            ? DELIVERY_TERM_LABELS[tender.deliveryTerm]
            : "—"}
        </DescriptionDetails>
        <DescriptionTerm>Teslimat Adresi</DescriptionTerm>
        <DescriptionDetails>
          {tender.deliveryAddressSnapshot ? (
            <AddressSnapshotDisplay snapshot={tender.deliveryAddressSnapshot} />
          ) : (
            <span className="whitespace-pre-wrap">
              {tender.deliveryAddress || "—"}
            </span>
          )}
        </DescriptionDetails>
        <DescriptionTerm>Ödeme</DescriptionTerm>
        <DescriptionDetails>
          {PAYMENT_TERM_LABELS[tender.paymentTerm]}
          {tender.paymentTerm === "DEFERRED" && tender.paymentDays
            ? ` — ${tender.paymentDays} gün`
            : ""}
        </DescriptionDetails>
      </DescriptionList>

      <Divider className="my-8" />

      {/* İhale Kuralları */}
      <Subheading>İhale Kuralları</Subheading>
      <ul className="mt-4 space-y-2.5">
        <RuleItem
          active={tender.isSealedBid}
          label="Kapalı zarf — diğer teklifleri göremezsiniz"
        />
        <RuleItem
          active={tender.requireAllItems}
          label="Tüm kalemlere teklif zorunlu"
        />
        <RuleItem
          active={tender.requireBidDocument}
          label="Teklif dosyası eki zorunlu"
        />
      </ul>

      {tender.termsAndConditions ? (
        <>
          <Divider className="my-8" />
          <Subheading>Hüküm ve Koşullar</Subheading>
          <Text className="mt-3 whitespace-pre-wrap leading-relaxed">
            {tender.termsAndConditions}
          </Text>
        </>
      ) : null}
    </div>
  );
}

/**
 * E.7.B — Tedarikçi tarafında teslimat adresi snapshot'ı.
 */
function AddressSnapshotDisplay({
  snapshot,
}: {
  snapshot: TenderAddressSnapshot;
}) {
  return (
    <div className="space-y-0.5">
      <p className="font-semibold text-zinc-900">{snapshot.title}</p>
      <p className="whitespace-pre-line text-zinc-700">{snapshot.fullAddress}</p>
      <p className="text-zinc-600">
        {snapshot.district} / {snapshot.city}
        {snapshot.postalCode ? ` · ${snapshot.postalCode}` : ""}
      </p>
      {snapshot.contactName ? (
        <p className="mt-1 text-xs text-zinc-500">
          İletişim: {snapshot.contactName}
          {snapshot.contactPhone ? ` · ${snapshot.contactPhone}` : ""}
        </p>
      ) : null}
    </div>
  );
}
