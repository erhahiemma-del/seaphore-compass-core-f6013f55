/**
 * User-upload adapters (manifests, bills of lading). Status: ACTIVE.
 * These adapters do not talk to third parties — they attest that the data
 * was DECLARED by an officer via upload and route the OCR call through the
 * Google Vision adapter.
 */
import { BaseAdapter } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface UploadRef { bucket: string; path: string; contentType: string }

class UserUploadAdapter extends BaseAdapter {
  async attest(ref: UploadRef): Promise<SourcedResult<UploadRef>> {
    this.assertUsable();
    return this.envelope<UploadRef>(ref, new Date().toISOString());
  }
}

export class ManifestUploadAdapter extends UserUploadAdapter { constructor() { super("manifest_upload"); } }
export class BolUploadAdapter extends UserUploadAdapter { constructor() { super("bol_upload"); } }

export const manifestUpload = new ManifestUploadAdapter();
export const bolUpload = new BolUploadAdapter();
