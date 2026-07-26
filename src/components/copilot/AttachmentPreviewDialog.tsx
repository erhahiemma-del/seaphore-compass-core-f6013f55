/**
 * AttachmentPreviewDialog — officer confirmation surface for an attached
 * manifest or document.
 *
 * Presentation only. It renders what the officer is about to submit: a
 * visual preview where the browser can render one, plus the metadata and
 * provenance that will travel with the evidence bundle. No intelligence
 * logic, no network calls, no interpretation of file contents.
 */
import { FileSpreadsheet, FileText, ImageIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatBytes,
  storageRef,
  type AttachmentItem,
} from "@/hooks/use-officer-attachments";

interface Props {
  attachment: AttachmentItem | null;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-medium text-foreground">{value}</span>
    </div>
  );
}

export function AttachmentPreviewDialog({ attachment, onOpenChange }: Props) {
  const a = attachment;
  const isImage = Boolean(a?.previewUrl) && a!.contentType.startsWith("image/");
  const isPdf = Boolean(a?.previewUrl) && a!.contentType === "application/pdf";

  return (
    <Dialog open={Boolean(a)} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="attachment-preview-dialog"
        className="max-w-2xl"
      >
        {a ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[15px]">
                {a.kind === "MANIFEST" ? (
                  <FileSpreadsheet className="h-4 w-4 text-[color:var(--color-teal)]" />
                ) : (
                  <FileText className="h-4 w-4 text-[color:var(--color-teal)]" />
                )}
                <span className="truncate">{a.name}</span>
              </DialogTitle>
              <DialogDescription>
                Confirm what you are submitting. This document travels with the
                investigation as officer-supplied evidence.
              </DialogDescription>
            </DialogHeader>

            <div className="flex h-[240px] items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30">
              {isImage ? (
                <img
                  data-testid="attachment-preview-image"
                  src={a.previewUrl}
                  alt={`Preview of ${a.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : isPdf ? (
                <iframe
                  data-testid="attachment-preview-pdf"
                  src={a.previewUrl}
                  title={`Preview of ${a.name}`}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 text-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  <p className="text-[12px] text-muted-foreground">
                    No inline preview for this file type. The metadata below is
                    exactly what will be submitted.
                  </p>
                </div>
              )}
            </div>

            <div className="divide-y divide-border/50">
              <Row label="Name" value={a.name} />
              <Row
                label="Type"
                value={`${a.kind === "MANIFEST" ? "Manifest" : "Document"} · ${a.contentType}`}
              />
              <Row label="Size" value={formatBytes(a.size)} />
              <Row
                label="Status"
                value={
                  a.status === "UPLOADED"
                    ? "Uploaded"
                    : a.status === "UPLOADING"
                      ? `Uploading — ${a.progress}%`
                      : `Upload failed — ${a.error ?? "unknown error"}`
                }
              />
              <Row label="Uploaded by" value={a.uploadedByLabel} />
              <Row label="Uploaded at" value={a.uploadedAt} />
              <Row label="Storage ref" value={storageRef(a)} />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
