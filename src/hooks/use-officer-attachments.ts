/**
 * useOfficerAttachments — officer-supplied manifests / documents.
 *
 * Transport only: the officer picks a file, it is validated and uploaded to
 * the private `manifests` (spreadsheets / manifests) or `evidence` bucket, and
 * a provenance record is handed back to the caller. No intelligence logic and
 * no automatic interpretation — the officer decides what the document means.
 */
import { useCallback, useMemo, useRef, useState } from "react";

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
  /** ISO timestamp of the moment the object landed in storage. */
  uploadedAt: string;
  /** Uploading officer's account id — the provenance owner of this evidence. */
  uploadedBy: string;
  /** Human-readable uploader label (email where available). */
  uploadedByLabel: string;
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

/** Canonical storage reference for an attachment: `bucket://path`. */
export function storageRef(a: OfficerAttachment): string {
  return `${a.bucket}://${a.path}`;
}

/**
 * Renders the attachment set as officer-authored context for the pipeline.
 * Every line carries full provenance — uploader, upload time and the exact
 * storage reference — so nothing downstream cites a document it cannot trace.
 */
export function describeAttachments(attachments: OfficerAttachment[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map(
    (a) =>
      `- ${a.name} — ${a.kind.toLowerCase()}, ${formatBytes(a.size)}, ${a.contentType}\n` +
      `  uploaded_by: ${a.uploadedByLabel} (${a.uploadedBy})\n` +
      `  uploaded_at: ${a.uploadedAt}\n` +
      `  storage_ref: ${storageRef(a)}`,
  );
  return [
    "Officer-attached documents (officer-supplied evidence — provenance below).",
    "Cite these only by name and storage_ref; do not infer content that was not read.",
    ...lines,
  ].join("\n");
}


/** An attachment as the officer sees it: in flight, uploaded, or failed. */
export interface AttachmentItem extends OfficerAttachment {
  status: "UPLOADING" | "UPLOADED" | "ERROR";
  /** 0–100. Byte-accurate while uploading. */
  progress: number;
  error?: string;
  /**
   * Local object URL for confirmation previews (images / PDFs only).
   * Browser-side only — never part of the evidence bundle.
   */
  previewUrl?: string;
}


export interface UseOfficerAttachments {
  /** Successfully uploaded attachments only — what the pipeline may cite. */
  attachments: OfficerAttachment[];
  /** Every attachment including in-flight and failed ones, for the UI. */
  items: AttachmentItem[];
  uploading: boolean;
  add: (files: FileList | File[]) => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

/**
 * PUT to a Supabase signed upload URL via XHR so we get byte-level progress.
 * `supabase.storage.upload()` uses fetch, which cannot report progress.
 */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage responded ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });
}

export function useOfficerAttachments(options?: {
  onError?: (message: string) => void;
}): UseOfficerAttachments {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const onError = options?.onError;
  /** Originals kept in memory so a failed upload can be retried as-is. */
  const sources = useRef(new Map<string, File>());

  const patch = useCallback((id: string, next: Partial<AttachmentItem>) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...next } : a)));
  }, []);

  const upload = useCallback(
    async (id: string, file: File, bucket: OfficerAttachment["bucket"], path: string) => {
      patch(id, { status: "UPLOADING", progress: 0, error: undefined });
      const contentType = file.type || "application/octet-stream";
      try {
        const signed = await supabase.storage.from(bucket).createSignedUploadUrl(path, {
          upsert: true,
        });
        if (signed.error || !signed.data?.signedUrl) {
          throw new Error(signed.error?.message ?? "Could not start the upload.");
        }
        // storage-js returns an absolute signed URL.
        await putWithProgress(signed.data.signedUrl, file, contentType, (pct) => patch(id, { progress: pct }));
        patch(id, {
          status: "UPLOADED",
          progress: 100,
          uploadedAt: new Date().toISOString(),
          error: undefined,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed.";
        console.error("[Attachments] upload failed", e);
        // The row stays in the list in ERROR state: the officer retries or
        // removes it deliberately, rather than the file vanishing silently.
        patch(id, { status: "ERROR", error: message });
        onError?.(`${file.name}: upload failed — ${message}`);
      }
    },
    [onError, patch],
  );

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
      const uploaderLabel = auth.user?.email ?? userId;

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

        sources.current.set(id, file);
        // Visual confirmation only — images and PDFs render inline so the
        // officer can verify the document before it travels with the query.
        const previewable =
          file.type.startsWith("image/") || file.type === "application/pdf";
        const previewUrl =
          previewable && typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : undefined;
        setItems((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            bucket,
            path,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userId,
            uploadedByLabel: uploaderLabel,
            kind: isManifest ? "MANIFEST" : "DOCUMENT",
            status: "UPLOADING",
            progress: 0,
            previewUrl,
          },
        ]);



        await upload(id, file, bucket, path);
      }
    },
    [onError, upload],
  );

  const retry = useCallback(
    async (id: string) => {
      const target = items.find((a) => a.id === id);
      const file = sources.current.get(id);
      if (!target || !file) {
        onError?.("That file is no longer available — attach it again.");
        return;
      }
      await upload(id, file, target.bucket, target.path);
    },
    [items, onError, upload],
  );

  const remove = useCallback(async (id: string) => {
    let target: AttachmentItem | undefined;
    setItems((prev) => {
      target = prev.find((a) => a.id === id);
      return prev.filter((a) => a.id !== id);
    });
    sources.current.delete(id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    // Only an uploaded object exists in storage; a failed one has nothing to delete.
    if (target?.status === "UPLOADED") {
      const { error } = await supabase.storage.from(target.bucket).remove([target.path]);
      if (error) console.warn("[Attachments] remove failed", error);
    }
  }, []);

  const clear = useCallback(() => {
    sources.current.clear();
    setItems((prev) => {
      for (const a of prev) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return [];
    });
  }, []);

  const attachments = useMemo(
    () =>
      items
        .filter((a) => a.status === "UPLOADED")
        .map(({ status: _s, progress: _p, error: _e, previewUrl: _u, ...rest }) => rest),
    [items],
  );

  const uploading = items.some((a) => a.status === "UPLOADING");

  return { attachments, items, uploading, add, retry, remove, clear };
}

