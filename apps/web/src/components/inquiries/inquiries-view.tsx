"use client";

import { EmptyState } from "@/components/list";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { Badge } from "@/components/catalyst/badge";
import { formatDate } from "@/lib/format-date";
import {
  useReceivedInquiries,
  useReplyInquiry,
  useSentInquiries,
  type ReceivedInquiry,
  type SentInquiry,
} from "@/hooks/use-inquiries";
import { InboxIcon, PaperAirplaneIcon } from "@heroicons/react/20/solid";
import { Inbox, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * BİLGİ TALEPLERİ ekranı — PORTAL YÖNÜ içeriği belirler.
 *
 * Eskiden tek ekranda iki sekme vardı ("Gelen" + "Gönderdiklerim") ve o ekran
 * yalnız SATIŞ portalındaydı. Sonuç: alıcı olarak gönderdiğin talepler satış
 * panelinin altında yaşıyordu — satın alma panelinde bilgi talebi diye bir şey
 * yoktu. Rol sınırının sızması buydu.
 *
 * Artık aynı bileşen iki yerde, tek yön gösterir:
 *   satis     → "Gelen"          (ürünlerime gelen sorular)
 *   satinalma → "Gönderdiklerim" (benim sorduklarım)
 * Veri katmanı ORTAK; bölünen yalnız hangi ucun okunduğu. Karşı yönün sorgusu
 * hiç açılmaz — rolü olmayan portalda gereksiz istek atmanın anlamı yok.
 *
 * Ziyaretçinin e-postası ve telefonu GÖSTERİLMEZ — uç zaten döndürmüyor
 * (satıcı doğrudan yazıp platformu atlamasın diye).
 */
export function InquiriesView({
  portal = "satis",
}: {
  portal?: "satis" | "satinalma";
} = {}) {
  const isSeller = portal === "satis";
  const received = useReceivedInquiries(isSeller);
  const sent = useSentInquiries(!isSeller);
  const tab: "received" | "sent" = isSeller ? "received" : "sent";
  // Satıcı sekmeleri gerçek bir ayrım taşır: yanıt BEKLEYEN ↔ YANITLANAN (tek
  // sekmeli çubuk anlamsızdı — v2 7d). Alıcıda sekme çubuğu yok.
  const [sellerTab, setSellerTab] = useState<"open" | "answered">("open");
  const receivedItems = received.data?.items ?? [];
  const openItems = receivedItems.filter((i) => i.replies.length === 0);
  const answeredItems = receivedItems.filter((i) => i.replies.length > 0);
  const shownReceived = sellerTab === "open" ? openItems : answeredItems;

  return (
    <PageContainer>
      <PageHeader
        title={isSeller ? "Bilgi Talepleri" : "Bilgi Taleplerim"}
        description={
          isSeller
            ? "Ürünleriniz hakkında gelen sorular — yanıtladıkça alıcı panelinde görünür."
            : "Tedarikçi ürünleri hakkında gönderdiğiniz sorular ve gelen yanıtlar."
        }
        action={
          isSeller ? undefined : (
            <Link
              href="/company/satinalma/urunler"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Ürün ara
            </Link>
          )
        }
      />

      {isSeller ? (
        <div className="mt-6 flex gap-2">
          <TabButton
            active={sellerTab === "open"}
            onClick={() => setSellerTab("open")}
            icon={InboxIcon}
            label="Gelen"
            count={received.data ? openItems.length : undefined}
          />
          <TabButton
            active={sellerTab === "answered"}
            onClick={() => setSellerTab("answered")}
            icon={PaperAirplaneIcon}
            label="Yanıtlanan"
            count={received.data ? answeredItems.length : undefined}
          />
        </div>
      ) : null}

      <div className="mt-8">
        {tab === "received" ? (
          received.isLoading ? (
            <Loading />
          ) : receivedItems.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Henüz bilgi talebi yok."
              description="Ürünlerinizi vitrine çıkardığınızda ziyaretçiler buradan soru sorabilir."
            />
          ) : shownReceived.length === 0 ? (
            <EmptyState
              icon={sellerTab === "open" ? Inbox : Send}
              title={sellerTab === "open" ? "Yanıt bekleyen talep yok." : "Henüz yanıtlanan talep yok."}
              variant="no-results"
            />
          ) : (
            <ul className="space-y-4">
              {shownReceived.map((i) => (
                <ReceivedCard key={i.id} inquiry={i} />
              ))}
            </ul>
          )
        ) : sent.isLoading ? (
          <Loading />
        ) : (sent.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Send}
            title="Gönderdiğiniz talep yok."
            description="Ürün Ara'dan bir ürüne girip 'Bilgi / teklif iste' ile soru gönderin; yanıtlar burada birikir."
          />
        ) : (
          <ul className="space-y-4">
            {sent.data?.map((i) => (
              <SentCard key={i.id} inquiry={i} />
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-zinc-950 text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      }`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
      {count != null && count > 0 ? (
        <span className={active ? "text-zinc-300" : "text-zinc-400"}>{count}</span>
      ) : null}
    </button>
  );
}

function ReceivedCard({ inquiry }: { inquiry: ReceivedInquiry }) {
  const [body, setBody] = useState("");
  const reply = useReplyInquiry();

  const send = async () => {
    if (body.trim().length < 2) return;
    try {
      await reply.mutateAsync({ id: inquiry.id, body });
      setBody("");
      toast.success("Yanıtınız gönderildi");
    } catch {
      toast.error("Yanıt gönderilemedi");
    }
  };

  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">
            {inquiry.name}
            {inquiry.companyName ? (
              <span className="font-normal text-zinc-500">
                {" "}
                · {inquiry.companyName}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {inquiry.product.name}
            {inquiry.quantity ? ` · ${inquiry.quantity}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inquiry.hasAccount ? (
            <Badge color="emerald">Kayıtlı kullanıcı</Badge>
          ) : (
            <Badge color="zinc">Misafir</Badge>
          )}
          <span className="text-xs text-zinc-400">
            {formatDate(inquiry.receivedAt, "datetime")}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm/6 whitespace-pre-line text-zinc-700">
        {inquiry.message}
      </p>

      {inquiry.replies.length > 0 ? (
        <ul className="mt-4 space-y-2 border-l-2 border-zinc-200 pl-4">
          {inquiry.replies.map((r) => (
            <li key={r.id}>
              <p className="text-sm/6 whitespace-pre-line text-zinc-600">
                {r.body}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {formatDate(r.createdAt, "datetime")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-zinc-950/5 pt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Yanıtınızı yazın…"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* Ziyaretçi henüz kaydolmadıysa yanıtı okumak için hesap açması
              gerekiyor — satıcı bunu bilerek yazsın. */}
          <p className="text-xs text-zinc-500">
            {inquiry.hasAccount
              ? "Yanıtınız panelinden görünür."
              : "Ziyaretçiye “yanıt geldi” bildirimi gider; okumak için hesap açması gerekir."}
          </p>
          <button
            type="button"
            onClick={() => void send()}
            disabled={reply.isPending || body.trim().length < 2}
            className="shrink-0 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            Yanıtla
          </button>
        </div>
      </div>
    </li>
  );
}

function SentCard({ inquiry }: { inquiry: SentInquiry }) {
  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">
            {inquiry.seller.name}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{inquiry.product.name}</p>
        </div>
        <span className="text-xs text-zinc-400">
          {formatDate(inquiry.sentAt, "datetime")}
        </span>
      </div>

      <p className="mt-4 text-sm/6 whitespace-pre-line text-zinc-600">
        {inquiry.message}
      </p>

      {inquiry.replies.length > 0 ? (
        <ul className="mt-4 space-y-2 rounded-xl bg-zinc-50 p-4">
          {inquiry.replies.map((r) => (
            <li key={r.id}>
              <p className="text-sm/6 whitespace-pre-line text-zinc-800">
                {r.body}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {formatDate(r.createdAt, "datetime")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Henüz yanıt gelmedi.</p>
      )}
    </li>
  );
}

function Loading() {
  return <p className="text-sm text-zinc-500">Yükleniyor…</p>;
}

