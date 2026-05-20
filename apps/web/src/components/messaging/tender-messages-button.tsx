"use client";

import { MessageDialog } from "@/components/messaging/message-dialog";
import { Button } from "@/components/ui/button";
import { useTenderThreadsForTenant } from "@/hooks/use-messages";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { format, isToday } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";

interface Props {
  tenderId: string;
  tenderNumber: string;
}

/**
 * İhale detayında "Mesajlaş" CTA — header'a koyulur. Dropdown'da davetli
 * tedarikçi listesi (her birinin unread badge'i ile), seçince modal sohbet
 * açılır. TENDER context multi-supplier olduğu için bu pattern: önce
 * tedarikçi seç, sonra konuş.
 */
export function TenderMessagesButton({ tenderId, tenderNumber }: Props) {
  const { data, isLoading } = useTenderThreadsForTenant(tenderId);
  const [openSupplier, setOpenSupplier] = useState<{
    supplierId: string;
    supplierName: string;
  } | null>(null);

  const hasUnread = data?.some((t) => t.unread) ?? false;

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" size="sm">
            <MessageCircle className="w-4 h-4" />
            Mesajlaş
            {hasUnread ? (
              <span
                className="ml-1 w-2 h-2 rounded-full bg-danger-500"
                aria-label="Okunmamış mesaj var"
              />
            ) : null}
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={6}
            align="end"
            className="z-[55] w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Davetli Tedarikçiler
            </DropdownMenu.Label>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : !data || data.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-500">
                İhaleye henüz tedarikçi davet edilmemiş.
              </p>
            ) : (
              <div className="space-y-1">
                {data.map((t) => {
                  const sentAt = t.lastMessageAt
                    ? new Date(t.lastMessageAt)
                    : null;
                  return (
                    <DropdownMenu.Item
                      key={t.supplierId}
                      onSelect={(e) => {
                        e.preventDefault();
                        setOpenSupplier({
                          supplierId: t.supplierId,
                          supplierName: t.supplierName,
                        });
                      }}
                      className="w-full text-left p-2 rounded-lg cursor-pointer outline-none focus:bg-brand-50 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-4 w-4 text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-brand-900 truncate">
                              {t.supplierName}
                            </p>
                            {t.unread ? (
                              <span
                                className="bg-danger-500 h-2 w-2 rounded-full flex-shrink-0"
                                title="Yeni mesaj"
                              />
                            ) : null}
                          </div>
                          {t.lastMessageContent ? (
                            <p className="text-xs text-slate-600 truncate mt-0.5">
                              {t.lastMessageSenderType === "TENANT_USER"
                                ? "Sen: "
                                : ""}
                              {t.lastMessageContent}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5 italic">
                              Henüz mesaj yok
                            </p>
                          )}
                          {sentAt ? (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {isToday(sentAt)
                                ? format(sentAt, "HH:mm", { locale: tr })
                                : format(sentAt, "d MMM HH:mm", { locale: tr })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </DropdownMenu.Item>
                  );
                })}
              </div>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {openSupplier ? (
        <MessageDialog
          open={!!openSupplier}
          onClose={() => setOpenSupplier(null)}
          surface="tenant"
          otherPartyId={openSupplier.supplierId}
          defaultContext={{ context: "TENDER", contextRefId: tenderId }}
          currentUserType="TENANT_USER"
          otherPartyName={openSupplier.supplierName}
          contextNumber={tenderNumber}
        />
      ) : null}
    </>
  );
}
