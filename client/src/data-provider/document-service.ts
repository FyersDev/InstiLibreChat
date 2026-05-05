/**
 * Document types + helpers for chat/tools UI.
 * Archived legacy document client — uploads use FYERS research (`saasApi.uploadFile`).
 */

import { saasApi } from '~/services/saasApi';

export interface DocumentUploadResponse {
  code?: number;
  message?: string;
  s?: string;
  data?: unknown;
}

export interface DocumentListItem {
  document_id: string;
  name: string;
  file_path: string;
  uploaded_at: string | null;
  processed_at?: string | null;
  owner?: string | null;
  status?: string | null;
}

export interface DocumentListResponse {
  code?: number;
  message?: string;
  s?: string;
  data:
    | {
        documents?: DocumentListItem[];
        total_count?: number;
        page?: number;
        limit?: number;
      }
    | DocumentListItem[];
}

function mapConfluxDocToListItem(row: Record<string, unknown>): DocumentListItem {
  const id = String(row.document_id ?? row.id ?? '');
  const storage = String(row.storage_key ?? row.storagePath ?? '');
  return {
    document_id: id,
    name: String(row.name ?? ''),
    file_path: storage,
    uploaded_at: String(row.uploaded_at ?? row.created_at ?? '') || null,
    processed_at: row.processed_at != null ? String(row.processed_at) : undefined,
    owner: row.created_by != null ? String(row.created_by) : undefined,
    status: row.status != null ? String(row.status) : undefined,
  };
}

/** Upload via FYERS org research (multipart). */
export const uploadDocument = async (
  file: File,
  _owner?: string,
  orgId?: string,
): Promise<DocumentUploadResponse> => {
  await saasApi.uploadFile(file, undefined, orgId ?? null);
  return { code: 200, s: 'ok' };
};

/** List documents via FYERS list endpoint shape exposed by saasApi.getFiles. */
export const fetchDocuments = async (): Promise<DocumentListResponse> => {
  const data = (await saasApi.getFiles(undefined, 1, 1000, null)) as {
    documents?: Record<string, unknown>[];
  };
  const docs = (data.documents ?? []).map((d) => mapConfluxDocToListItem(d));
  return {
    code: 200,
    s: 'ok',
    data: { documents: docs, total_count: docs.length, page: 1, limit: 1000 },
  };
};
