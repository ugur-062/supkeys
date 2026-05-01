"use client";

import { useInvitationPreview } from "@/hooks/use-supplier-invitations";
import axios from "axios";
import { Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";

interface EmailPreviewPanelProps {
  contactName?: string;
  message?: string;
  enabled: boolean;
}

const DEBOUNCE_MS = 500;

export function EmailPreviewPanel({
  contactName,
  message,
  enabled,
}: EmailPreviewPanelProps) {
  // Kullanıcı yazarken her tuşta API çağırma — 500ms debounce
  const [debouncedContact, setDebouncedContact] = useState(contactName);
  const [debouncedMessage, setDebouncedMessage] = useState(message);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedContact(contactName);
      setDebouncedMessage(message);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [contactName, message]);

  const { data, isLoading, isError, error } = useInvitationPreview({
    contactName: debouncedContact,
    message: debouncedMessage,
    enabled,
  });

  const errorMsg =
    isError && axios.isAxiosError(error)
      ? ((error.response?.data as { message?: string })?.message ??
        "Önizleme yüklenemedi")
      : isError
        ? "Önizleme yüklenemedi"
        : null;

  return (
    <div className="border border-surface-border rounded-lg overflow-hidden mt-3">
      <div className="bg-slate-50 px-3 py-2 border-b border-surface-border flex items-center gap-2 text-xs text-slate-600">
        <Mail className="h-3 w-3" />
        <span className="truncate">
          Önizleme: {data?.subject ?? "—"}
        </span>
      </div>
      <div className="bg-white relative">
        {isLoading || !data ? (
          <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor…
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center text-danger-600 text-sm">
            {errorMsg}
          </div>
        ) : (
          <iframe
            srcDoc={data.html}
            title="E-posta önizlemesi"
            className="w-full h-96 border-0"
            sandbox=""
          />
        )}
      </div>
    </div>
  );
}
