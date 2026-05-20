"use client";

import { MessageThread } from "@/components/messaging/message-thread";
import type {
  MessageContext,
  MessageSenderType,
  MessageSurface,
} from "@/lib/messages/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  surface: MessageSurface;
  context: MessageContext;
  contextRefId: string;
  /** SADECE surface=tenant + context=TENDER için zorunlu (multi-supplier ayrımı) */
  targetSupplierId?: string;
  currentUserType: MessageSenderType;
  /** Header'da görünecek karşı taraf adı (tedarikçi adı veya alıcı firma adı) */
  otherPartyName: string;
  /** "İhale SUPK-..." veya "Sipariş ORD-..." */
  contextNumber: string;
}

/**
 * Messenger-tarzı modal mesaj kutusu. Tender/Order detay sayfalarında
 * inline mesajlaşma yerine kullanılır. Desktop'ta merkez modal, mobilde
 * full-screen sheet.
 */
export function MessageDialog({
  open,
  onClose,
  surface,
  context,
  contextRefId,
  targetSupplierId,
  currentUserType,
  otherPartyName,
  contextNumber,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed z-[60] outline-none bg-white shadow-2xl",
            // Mobile: bottom sheet full-screen
            "inset-x-0 bottom-0 top-0 sm:inset-auto",
            // Desktop: centered modal
            "sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:h-[80vh] sm:max-h-[700px]",
            "sm:rounded-2xl",
            "flex flex-col",
          )}
        >
          <Dialog.Title className="sr-only">
            {otherPartyName} ile mesajlaşma
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {contextNumber}
          </Dialog.Description>

          {/* Close button - dialog header overlay'i, MessageThread'in kendi header'ı zaten var */}
          <Dialog.Close asChild>
            <button
              aria-label="Kapat"
              className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white/80 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </Dialog.Close>

          <div className="flex-1 min-h-0 flex flex-col">
            <MessageThread
              surface={surface}
              context={context}
              contextRefId={contextRefId}
              targetSupplierId={targetSupplierId}
              currentUserType={currentUserType}
              headerInfo={{ otherPartyName, contextNumber }}
              className="h-full !h-full flex-1"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
