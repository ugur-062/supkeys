"use client";

import { api } from "@/lib/api";
import type {
  AttachmentItem,
  AttachmentScope,
  AttachmentSurface,
  DownloadUrlResponse,
  RequestUploadUrlResponse,
} from "@/lib/attachments/types";
import { supplierApi } from "@/lib/supplier-auth/api";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { type AxiosInstance } from "axios";

function clientFor(surface: AttachmentSurface): AxiosInstance {
  return surface === "tenant" ? api : supplierApi;
}

function basePathFor(surface: AttachmentSurface): string {
  return surface === "tenant" ? "/attachments" : "/supplier/attachments";
}

const KEYS = {
  all: ["attachments"] as const,
  list: (surface: AttachmentSurface, scope: AttachmentScope, scopeRefId: string) =>
    [...KEYS.all, surface, scope, scopeRefId] as const,
};

export function useAttachments(
  surface: AttachmentSurface,
  scope: AttachmentScope,
  scopeRefId: string | undefined,
  enabled = true,
) {
  return useQuery<AttachmentItem[]>({
    queryKey: KEYS.list(surface, scope, scopeRefId ?? ""),
    queryFn: async () => {
      const { data } = await clientFor(surface).get<AttachmentItem[]>(
        basePathFor(surface),
        { params: { scope, scopeRefId } },
      );
      return data;
    },
    enabled: enabled && !!scopeRefId,
    staleTime: 30_000,
  });
}

export interface UploadParams {
  scope: AttachmentScope;
  scopeRefId: string;
  file: File;
  onProgress?: (percent: number) => void;
}

/**
 * 3 aşamalı upload:
 *   1. Backend'den presigned PUT URL iste (Attachment PENDING)
 *   2. Direkt R2'ye PUT (axios — interceptor'sız!)
 *   3. Backend'e finalize bildir (Attachment UPLOADED)
 */
export function useUploadAttachment(surface: AttachmentSurface) {
  const qc = useQueryClient();
  const client = clientFor(surface);
  const base = basePathFor(surface);

  return useMutation({
    mutationFn: async (params: UploadParams) => {
      const { data: req } = await client.post<RequestUploadUrlResponse>(
        `${base}/upload-url`,
        {
          scope: params.scope,
          scopeRefId: params.scopeRefId,
          originalFilename: params.file.name,
          mimeType: params.file.type || "application/octet-stream",
          fileSize: params.file.size,
        },
      );

      // R2'ye direkt PUT — auth header'sız, interceptor'sız axios.
      await axios.put(req.uploadUrl, params.file, {
        headers: {
          "Content-Type": params.file.type || "application/octet-stream",
        },
        onUploadProgress: (e) => {
          if (params.onProgress && e.total) {
            params.onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });

      const { data: finalized } = await client.post<AttachmentItem>(
        `${base}/${req.attachmentId}/finalize`,
      );
      return finalized;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.list(surface, vars.scope, vars.scopeRefId),
      });
    },
  });
}

export function useDeleteAttachment(surface: AttachmentSurface) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const { data } = await clientFor(surface).delete<{ success: boolean }>(
        `${basePathFor(surface)}/${attachmentId}`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDownloadAttachment(surface: AttachmentSurface) {
  return useMutation({
    mutationFn: async (attachment: AttachmentItem) => {
      const { data } = await clientFor(surface).get<DownloadUrlResponse>(
        `${basePathFor(surface)}/${attachment.id}/download-url`,
      );
      // Yeni tab/download — Cloudflare presigned URL'e direkt git.
      const a = document.createElement("a");
      a.href = data.url;
      a.download = attachment.originalFilename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  });
}
