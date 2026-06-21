"use client";

import { MessageThread } from "@/components/messaging/message-thread";
import { IconButton } from "@/components/ui/icon-button";
import type {
  MessageContext,
  MessageSenderType,
  MessageSurface,
} from "@/lib/messages/types";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  surface: MessageSurface;
  /** Karşı taraf ID — tenant için supplierId, supplier için tenantId. */
  otherPartyId: string;
  /** Bu dialog'tan gönderilen mesajlara auto-tag (örn. tender detay açtıysa
   * TENDER+tenderId). Boşsa DIRECT. */
  defaultContext?: { context: MessageContext; contextRefId?: string };
  currentUserType: MessageSenderType;
  otherPartyName: string;
  contextNumber: string;
}

/**
 * V2-4.2 — Unified thread modal. Catalyst'in temeli olan Headless UI Dialog
 * ile; tam-yükseklik sohbet paneli (form Dialog'unun gutter padding'i yerine
 * bleed layout). Mobilde tam ekran, desktop'ta ortalı 2xl panel.
 */
export function MessageDialog({
  open,
  onClose,
  surface,
  otherPartyId,
  defaultContext,
  currentUserType,
  otherPartyName,
  contextNumber,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/25 transition data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
      />
      <div className="fixed inset-0 flex w-screen items-stretch justify-center sm:items-center sm:p-4">
        <DialogPanel
          transition
          className="relative flex w-full flex-col bg-white shadow-2xl outline-none transition data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in sm:h-[80vh] sm:max-h-[700px] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:ring-1 sm:ring-zinc-950/10 data-closed:sm:scale-95"
        >
          <DialogTitle className="sr-only">
            {otherPartyName} ile mesajlaşma — {contextNumber}
          </DialogTitle>

          <IconButton
            aria-label="Kapat"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 bg-white/80"
          >
            <X className="h-4 w-4" />
          </IconButton>

          <div className="flex min-h-0 flex-1 flex-col">
            <MessageThread
              surface={surface}
              otherPartyId={otherPartyId}
              defaultContext={defaultContext}
              currentUserType={currentUserType}
              headerInfo={{ otherPartyName, contextNumber }}
              className="h-full !h-full flex-1"
            />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
