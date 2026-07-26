/**
 * useOfficerAttachments — officer-supplied manifests / documents.
 *
 * Transport only: the officer picks a file, it is validated and uploaded to
 * the private `manifests` (spreadsheets / manifests) or `evidence` bucket, and
 * a provenance record is handed back to the caller. No intelligence logic and
 * no automatic interpretation — the officer decides what the document means.
 */
import { useCallback, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

const MANIFEST_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = [
  "pdf",
  "csv",
  "xls",
  "xlsx",
  "doc",
  "docx",
  "txt",
  "json",
  "png",
  "jpg",
  "jpeg",
];

export const ATTACHMENT_ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface OfficerAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  bucket: "manifests" | "evidence";
  path: string;
  uploadedAt: string;
  kind: "MANIFEST" | "DOCUMENT";
}

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1]! : "";
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Renders the attachment set as officer-authored context for the pipeline. */
export function describeAttachments(attachments: OfficerAttachment[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map(
    (a) =>
      `- ${a.name} (${a.kind.toLowerCase()}, ${formatBytes(a.size)}) [${a.bucket}://${a.path}]`,
  );
  return `Officer-attached documents (uploaded evidence, treat as officer-supplied source):\n${lines.join("\n")}`;
}

export interface UseOfficerAttachments {
  attachments: OfficerAttachment[];
  uploading: boolean;
  add: (files: FileList | File[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

export function useOfficerAttachments(options?: {
  onError?: (message: string) => void;
}): UseOfficerAttachments {
  const [attachments, setAttachments] = useState<OfficerAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const onError = options?.onError;

  const add = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        onError?.("Sign in to attach documents to an investigation.");
        return;
      }

      setUploading(true);
      try {
        for (const file of list) {
          const ext = extensionOf(file.name);
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            onError?.(`${file.name}: unsupported file type.`);
            continue;
          }
          if (file.size > MAX_ATTACHMENT_BYTES) {
            onError?.(`${file.name}: exceeds the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`);
            continue;
          }

          const isManifest = MANIFEST_TYPES.has(file.type) || ["csv", "xls", "xlsx"].includes(ext);
          const bucket: OfficerAttachment["bucket"] = isManifest ? "manifests" : "evidence";
          const id = crypto.randomUUID();
          const path = `${userId}/copilot/${id}-${sanitize(file.name)}`;

          const { error } = await supabase.storage
            .from(bucket)
            .upload(path, file, { contentType: file.type || "application/octet-stream" });

          if (error) {
            console.error("[Attachments] upload failed", error);
            onError?.(`${file.name}: upload failed — ${error.message}`);
            continue;
          }

          setAttachments((prev) => [
            ...prev,
            {
              id,
              name: file.name,
              size: file.size,
              contentType: file.type || "application/octet-stream",
              bucket,
              path,
              uploadedAt: new Date().toISOString(),
              kind: isManifest ? "MANIFEST" : "DOCUMENT",
            },
          ]);
        }
      } finally {
        setUploading(false);
      }
    },
    [onError],
  );

  const remove = useCallback(async (id: string) => {
    let target: OfficerAttachment | undefined;
    setAttachments((prev) => {
      target = prev.find((a) => a.id === id);
      return prev.filter((a) => a.id !== id);
    });
    if (target) {
      const { error } = await supabase.storage.from(target.bucket).remove([target.path]);
      if (error) console.warn("[Attachments] remove failed", error);
    }
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, uploading, add, remove, clear };
}
