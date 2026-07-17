"use client";

import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import {
  useOrderDocuments,
  useUploadOrderDoc,
  type OrderDocType,
} from "@/hooks/use-order-documents";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  LockClosedIcon,
} from "@heroicons/react/20/solid";
import { useRef } from "react";
import { toast } from "sonner";

function DocGroup({
  orderId,
  type,
  title,
  hint,
  canUpload,
  lockHint,
  docs,
}: {
  orderId: string;
  type: OrderDocType;
  title: string;
  hint: string;
  canUpload: boolean;
  /** canUpload false iken gösterilecek "şu adımdan sonra açılır" ipucu. */
  lockHint?: string | null;
  docs: { id: string; fileName: string; url: string; createdAt: string }[];
}) {
  const upload = useUploadOrderDoc(orderId);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`"${file.name}" 50MB sınırını aşıyor`);
      return;
    }
    try {
      await upload.mutateAsync({ file, type });
      toast.success("Belge yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const locked = !canUpload && !!lockHint;

  return (
    <div
      className={`rounded-lg border p-4 ${
        locked ? "border-zinc-200 bg-zinc-50/60" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">{hint}</div>
        </div>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {upload.isPending ? "Yükleniyor…" : "Yükle"}
            </button>
          </>
        ) : locked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500">
            <LockClosedIcon className="h-3.5 w-3.5" />
            Kilitli
          </span>
        ) : null}
      </div>

      {locked ? (
        <p className="mt-2 text-xs text-zinc-500">{lockHint}</p>
      ) : null}

      <div className="mt-3 space-y-1">
        {docs.length === 0 ? (
          !locked ? (
            <Text className="text-xs text-zinc-400">Henüz belge yok.</Text>
          ) : null
        ) : (
          docs.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {d.fileName}
            </a>
          ))
        )}
      </div>
    </div>
  );
}

export function OrderDocumentsSection({
  order,
}: {
  order: CompanyOrderDetail;
}) {
  const orderId = order.id;
  const isSeller = order.role === "seller";
  const isBuyer = order.role === "buyer";
  const status = order.status;
  const terminal = status === "REJECTED" || status === "CANCELLED";
  // Teminat: ilan sahibi İSTEDİYSE (opsiyonel özellik; yalnız teslim-öncesi
  // ödemede seçilebilir) — satıcı parayı önden aldığı için teslimatı garanti
  // eder. Bayrak award anında siparişe snapshot'lanır.
  const requiresGuarantee = order.requireGuaranteeLetter;

  const isLc = order.paymentCategory === "LETTER_OF_CREDIT";

  const { data: docs } = useOrderDocuments(orderId);
  const delivery = (docs ?? []).filter((d) => d.type === "DELIVERY");
  const payment = (docs ?? []).filter((d) => d.type === "PAYMENT");
  const guarantee = (docs ?? []).filter((d) => d.type === "TEMINAT");
  const lc = (docs ?? []).filter((d) => d.type === "LC");
  const invoice = (docs ?? []).filter((d) => d.type === "INVOICE");
  const proforma = (docs ?? []).filter((d) => d.type === "PROFORMA");
  const other = (docs ?? []).filter((d) => d.type === "OTHER");

  // ── Adım bazlı yükleme pencereleri (backend assertCanUpload ile birebir) ──
  // Teminat: yalnız onay öncesi (PENDING), satıcı. Onaydan sonra salt-okunur.
  const canUploadTeminat = isSeller && status === "PENDING" && !terminal;
  // Teslim belgesi: satıcı gönderirken → onaydan teslime kadar.
  const deliveryOpen =
    status === "ACCEPTED" ||
    status === "CREATED" ||
    status === "IN_DELIVERY" ||
    status === "DELIVERED";
  const canUploadDelivery = isSeller && deliveryOpen && !terminal;
  // Ödeme dekontu: ödeme penceresi (paymentOpen) açıkken, alıcı. Akreditifte
  // ödeme banka kanalından — dekont kutusu hiç gösterilmez.
  const canUploadPayment = isBuyer && order.paymentOpen && !terminal;
  // Akreditif belgesi (küşat mektubu): alıcı, onaydan gönderime kadar.
  const lcOpen = status === "ACCEPTED" || status === "IN_DELIVERY";
  const canUploadLc = isBuyer && isLc && lcOpen && !terminal;
  const lcLockHint =
    isBuyer && isLc && !lcOpen && !terminal
      ? "Sipariş onaylandıktan sonra açılır."
      : null;
  // Fatura belgesi: satıcı, onaydan itibaren (PENDING hariç), sonlanana kadar.
  const invoiceOpen = status !== "PENDING" && !terminal;
  const canUploadInvoice = isSeller && invoiceOpen;
  const invoiceLockHint =
    isSeller && !invoiceOpen && !terminal
      ? "Sipariş onaylandıktan sonra açılır."
      : null;
  // Proforma fatura: satıcı, onaydan itibaren (PENDING hariç), sonlanana kadar.
  // Alıcı akreditif açmak / peşin ödemek için kullanır.
  const proformaOpen = status !== "PENDING" && !terminal;
  const canUploadProforma = isSeller && proformaOpen;
  const proformaLockHint =
    isSeller && !proformaOpen && !terminal
      ? "Sipariş onaylandıktan sonra açılır."
      : null;
  // Diğer belgeler (tek kutu): her iki taraf, sipariş sonlanmadıkça.
  const canUploadOther = !terminal;

  // Kilit ipuçları — sadece o belgeyi yüklemesi gereken taraf için.
  const deliveryLockHint =
    isSeller && !deliveryOpen && !terminal
      ? "Sipariş onaylandıktan sonra açılır."
      : null;
  const paymentLockHint =
    isBuyer && !order.paymentOpen && !terminal
      ? order.paymentTiming === "AFTER_DELIVERY"
        ? "Sipariş teslim alındıktan sonra açılır."
        : "Satıcı siparişi onayladıktan sonra açılır."
      : null;

  return (
    <section className="space-y-3">
      <Subheading>Belgeler</Subheading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Teminat grubu: ilan teminat şartlıysa her zaman; değilse yalnız
            belge varsa (eski/gönüllü kayıtlar) gösterilir. */}
        {requiresGuarantee || guarantee.length > 0 ? (
          <DocGroup
            orderId={orderId}
            type="TEMINAT"
            title="Teminat Mektubu"
            hint={
              requiresGuarantee
                ? "İlanda teminat şartı var — satıcı, sipariş onayından ÖNCE yükler (zorunlu)"
                : "Teslimat garantisi (satıcı yükler)"
            }
            canUpload={canUploadTeminat}
            docs={guarantee}
          />
        ) : null}
        <DocGroup
          orderId={orderId}
          type="DELIVERY"
          title="Teslim Belgesi"
          hint="İrsaliye / sevk belgesi (satıcı yükler)"
          canUpload={canUploadDelivery}
          lockHint={deliveryLockHint}
          docs={delivery}
        />
        {/* Akreditif belgesi — yalnız LC siparişte; ödeme dekontu gösterilmez. */}
        {isLc ? (
          <DocGroup
            orderId={orderId}
            type="LC"
            title="Akreditif Belgesi"
            hint="Küşat mektubu (alıcı yükler) — 'Akreditif Açıldı' adımının ön koşulu"
            canUpload={canUploadLc}
            lockHint={lcLockHint}
            docs={lc}
          />
        ) : (
          <DocGroup
            orderId={orderId}
            type="PAYMENT"
            title="Ödeme Dekontu"
            hint="Ödeme kanıtı (alıcı yükler)"
            canUpload={canUploadPayment}
            lockHint={paymentLockHint}
            docs={payment}
          />
        )}
        {/* Fatura belgesi — satıcı yükler (fatura no'ya ek olarak PDF/görsel). */}
        <DocGroup
          orderId={orderId}
          type="INVOICE"
          title="Fatura Belgesi"
          hint="Satıcının kestiği fatura (satıcı yükler)"
          canUpload={canUploadInvoice}
          lockHint={invoiceLockHint}
          docs={invoice}
        />
        {/* Proforma fatura — satıcı yükler; alıcı LC açmak/peşin ödemek için. */}
        <DocGroup
          orderId={orderId}
          type="PROFORMA"
          title="Proforma Fatura"
          hint="Ön fatura (satıcı yükler) — alıcı akreditif açmak veya peşin ödeme için kullanır"
          canUpload={canUploadProforma}
          lockHint={proformaLockHint}
          docs={proforma}
        />
        {/* Diğer belgeler — serbest ek belge kutusu (her iki taraf). */}
        <DocGroup
          orderId={orderId}
          type="OTHER"
          title="Diğer Belgeler"
          hint="Sözleşme, ek şart, yazışma vb. (her iki taraf yükleyebilir)"
          canUpload={canUploadOther}
          docs={other}
        />
      </div>
    </section>
  );
}
