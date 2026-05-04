/**
 * insti-conflux-users — FYERS org-scoped research API (direct to Conflux host).
 *
 * Base URL / routes: `fyersOrgResearchUrl`, `FYERS_ORG_RESEARCH_SEGMENTS` in `client/src/constants/api_list.ts`.
 *
 * Auth: `Authorization: Bearer INSTI~…` — from cookie `_INSTI`, then `localStorage._INSTI`, then `access_token`
 * when it already starts with `INSTI~` (embed / SSO).
 * See docs/integration-instilibrechat-fyers-research.md and docs/research-api-fyers.reference.json.
 */

import {
  FYERS_ORG_RESEARCH_SEGMENTS as R,
  fyersOrgResearchUrl as fyersOrgResearchUrlBase,
  getFyersT2ApiBaseNormalized,
} from '~/constants/api_list';

/** Cookie and localStorage key for FYERS `INSTI~` JWT (fixed). */
export const FYERS_RESEARCH_JWT_STORAGE_KEY = '_INSTI' as const;

function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const prefix = `${name}=`;
  const segments = document.cookie.split(';');
  for (const segment of segments) {
    const part = segment.trim();
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return part.slice(prefix.length);
      }
    }
  }
  return null;
}

export function getConfluxBaseUrl(): string {
  return getFyersT2ApiBaseNormalized();
}

/** Raw JWT payload (with INSTI~ prefix) if available for org research calls. */
function resolveFyersJwtRaw(): string | null {
  const key = FYERS_RESEARCH_JWT_STORAGE_KEY;
  const fromCookie = readBrowserCookie(key)?.trim();
  if (fromCookie) {
    return fromCookie.replace(/^Bearer\s+/i, '').trim();
  }
  const fromKey = localStorage.getItem(key)?.trim();
  if (fromKey) {
    return fromKey.replace(/^Bearer\s+/i, '').trim();
  }
  const at = localStorage.getItem('access_token')?.trim();
  if (!at) {
    return null;
  }
  const core = at.replace(/^Bearer\s+/i, '').trim();
  return core.startsWith('INSTI~') ? core : null;
}

export function hasFyersResearchAuth(): boolean {
  return resolveFyersJwtRaw() != null;
}

/** Decode FYERS `INSTI~…` token payload (client-side only; server must still verify). */
function decodeJwtPayloadJson(jwtWithoutPrefix: string): Record<string, unknown> | null {
  const parts = jwtWithoutPrefix.split('.');
  if (parts.length < 2) {
    return null;
  }
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getFyersJwtPayload(): Record<string, unknown> | null {
  const raw = resolveFyersJwtRaw();
  if (!raw) {
    return null;
  }
  const jwt = raw.startsWith('INSTI~') ? raw.slice('INSTI~'.length) : raw;
  if (!jwt.includes('.')) {
    return null;
  }
  return decodeJwtPayloadJson(jwt);
}

export interface FyersInstiJwtClaims {
  org_id?: number;
  /** Present when the issuer includes user identity in the token. */
  email?: string;
}

/** Claims from the active FYERS `INSTI~` JWT (prefix stripped before decode). */
export function getFyersJwtClaims(): FyersInstiJwtClaims | null {
  const p = getFyersJwtPayload();
  if (!p) {
    return null;
  }
  const orgRaw = p.org_id ?? p.orgId;
  let org_id: number | undefined;
  if (typeof orgRaw === 'number' && Number.isFinite(orgRaw)) {
    org_id = orgRaw;
  } else if (typeof orgRaw === 'string' && /^\d+$/.test(orgRaw.trim())) {
    org_id = parseInt(orgRaw.trim(), 10);
  }
  let email: string | undefined;
  for (const key of ['email', 'user_email', 'mail', 'upn'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.includes('@')) {
      email = v;
      break;
    }
  }
  if (!email && typeof p.sub === 'string' && p.sub.includes('@')) {
    email = p.sub;
  }
  const out: FyersInstiJwtClaims = {};
  if (org_id !== undefined) {
    out.org_id = org_id;
  }
  if (email) {
    out.email = email;
  }
  return Object.keys(out).length ? out : null;
}

/** Org id from JWT `org_id` for Conflux paths when the caller did not pass an explicit org. */
export function getFyersOrgIdFromJwt(): string | null {
  const c = getFyersJwtClaims();
  if (c?.org_id == null) {
    return null;
  }
  return String(c.org_id);
}

/**
 * Path segment for `/insti/admin/org/{orgId}/research/...`. FYERS only accepts the numeric
 * `org_id` from the `INSTI~` JWT, not org directory UUIDs from `/api/v1`.
 */
export function confluxOrgPathId(orgId: number | string): string {
  const s = String(orgId).trim();
  if (/^\d+$/.test(s)) {
    return s;
  }
  const j = getFyersOrgIdFromJwt();
  if (j) {
    return j;
  }
  throw new Error(
    'FYERS research API expects a numeric org id or an INSTI~ JWT with org_id (directory UUIDs are not valid in the path).',
  );
}

/** Builds org-scoped research URLs; normalizes non-numeric `orgId` via `confluxOrgPathId`. */
export function fyersOrgResearchUrl(
  orgId: number | string,
  ...pathSegments: string[]
): string {
  return fyersOrgResearchUrlBase(confluxOrgPathId(orgId), ...pathSegments);
}

export const orgResearchUrl = fyersOrgResearchUrl;

/** Builds `Authorization: Bearer INSTI~…` (prepends `INSTI~` if the stored value omits it). */
export function getFyersResearchAuthHeaders(): HeadersInit {
  const core = resolveFyersJwtRaw();
  if (!core) {
    return {};
  }
  const token = core.startsWith('INSTI~') ? core : `INSTI~${core}`;
  return { Authorization: `Bearer ${token}` };
}

/**
 * FYERS JSON convention (`docs/research-api-fyers.reference.json` → `standardSuccessBody`):
 * `{ "s": "ok", "code": number, "data": <payload> }`. We unwrap `data` so callers keep using
 * `{ folders }`, `{ documents }`, `ResearchDocument`, etc.
 *
 * Multipart **processor** responses (`document-upload`, `save-report-upload`) keep
 * `{ s, code, message, data }` — when `message` is a non-empty string we return the **full** envelope
 * so `ProcessorSuccessEnvelope` readers still work.
 */
function unwrapStandardSuccessBody(data: Record<string, unknown>): unknown {
  if (data.s !== 'ok' || !Object.prototype.hasOwnProperty.call(data, 'data')) {
    return data;
  }
  const msg = data.message;
  const keepProcessorEnvelope =
    typeof msg === 'string' && msg.length > 0;
  if (keepProcessorEnvelope) {
    return data;
  }
  return data.data;
}

async function parseConfluxResponse<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) {
    return undefined;
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }

  if (data && typeof data === 'object' && data.s === 'error') {
    throw new Error(typeof data.message === 'string' ? data.message : 'Request failed');
  }

  const payload =
    data && typeof data === 'object' ? unwrapStandardSuccessBody(data) : data;
  return payload as T;
}

async function confluxFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = getFyersResearchAuthHeaders();
  if ('Authorization' in auth && auth.Authorization) {
    headers.set('Authorization', auth.Authorization as string);
  }
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

export interface ProcessorSuccessEnvelope {
  s?: string;
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
}

export const researchConfluxApi = {
  /** Single-shot multipart upload — fields align with inquora-style (`folder_id`, optional `metadata` JSON string). */
  async documentUpload(
    orgId: number | string,
    file: File,
    options?: { folderId?: string | number; metadata?: Record<string, unknown> },
  ): Promise<ProcessorSuccessEnvelope> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.folderId !== undefined && options.folderId !== '') {
      formData.append('folder_id', String(options.folderId));
    }
    if (options?.metadata) {
      formData.append('metadata', JSON.stringify(options.metadata));
    }
    const url = fyersOrgResearchUrl(orgId, R.documentUpload);
    const res = await confluxFetch(url, { method: 'POST', body: formData });
    return parseConfluxResponse<ProcessorSuccessEnvelope>(res) as Promise<ProcessorSuccessEnvelope>;
  },

  /** Multipart PDF save-report flow (distinct from inquora `/documents/save-report`). */
  async saveReportUpload(
    orgId: number | string,
    file: File,
    metadata?: Record<string, unknown>,
  ): Promise<ProcessorSuccessEnvelope> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    const url = fyersOrgResearchUrl(orgId, R.saveReportUpload);
    const res = await confluxFetch(url, { method: 'POST', body: formData });
    return parseConfluxResponse<ProcessorSuccessEnvelope>(res) as Promise<ProcessorSuccessEnvelope>;
  },

  async listDocuments(
    orgId: number | string,
    query?: { scope?: 'all'; folderId?: string | number; forSelection?: boolean | string },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (query?.scope === 'all') {
      params.set('scope', 'all');
    }
    if (query?.folderId !== undefined && query?.folderId !== '') {
      params.set('folderId', String(query.folderId));
    }
    if (query?.forSelection !== undefined) {
      params.set(
        'forSelection',
        typeof query.forSelection === 'boolean'
          ? query.forSelection
            ? 'true'
            : 'false'
          : String(query.forSelection),
      );
    }
    const qs = params.toString();
    const url =
      fyersOrgResearchUrl(orgId, R.documents) + (qs ? `?${qs}` : '');
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async getDocument(orgId: number | string, documentId: string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.documents, documentId);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async deleteDocument(orgId: number | string, documentId: string): Promise<void> {
    const url = fyersOrgResearchUrl(orgId, R.documents, documentId);
    const res = await confluxFetch(url, { method: 'DELETE' });
    await parseConfluxResponse(res);
  },

  async listFolders(orgId: number | string, parentFolderId?: string | number): Promise<unknown> {
    const params = new URLSearchParams();
    if (parentFolderId !== undefined && parentFolderId !== '') {
      params.set('parentFolderId', String(parentFolderId));
    }
    const qs = params.toString();
    const url = fyersOrgResearchUrl(orgId, R.folders) + (qs ? `?${qs}` : '');
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async createFolder(
    orgId: number | string,
    body: { name: string; parentFolderId?: number | null },
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.folders);
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async beginMultipart(
    orgId: number | string,
    body: {
      name: string;
      mimeType: string;
      sizeBytes: number;
      folderId?: number | null;
    },
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.documents);
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async presignMultipartPart(
    orgId: number | string,
    documentId: string,
    partNumber: number,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(
      orgId,
      R.documents,
      documentId,
      R.multipart,
      R.parts,
      String(partNumber),
    );
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async completeMultipart(
    orgId: number | string,
    documentId: string,
    parts: Array<{ partNumber: number; eTag: string }>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.documents, documentId, R.complete);
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    });
    return parseConfluxResponse(res);
  },

  async listTemplates(orgId: number | string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.templates);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async createTemplate(orgId: number | string, body: Record<string, unknown>): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.templates);
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async getTemplate(orgId: number | string, templateId: string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.templates, templateId);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async updateTemplate(
    orgId: number | string,
    templateId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.templates, templateId);
    const res = await confluxFetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async deleteTemplate(orgId: number | string, templateId: string): Promise<void> {
    const url = fyersOrgResearchUrl(orgId, R.templates, templateId);
    const res = await confluxFetch(url, { method: 'DELETE' });
    await parseConfluxResponse(res);
  },

  async listPersonas(orgId: number | string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.personas);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async createPersona(orgId: number | string, body: Record<string, unknown>): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.personas);
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async getPersona(orgId: number | string, personaId: string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.personas, personaId);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async updatePersona(
    orgId: number | string,
    personaId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.personas, personaId);
    const res = await confluxFetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async deletePersona(orgId: number | string, personaId: string): Promise<void> {
    const url = fyersOrgResearchUrl(orgId, R.personas, personaId);
    const res = await confluxFetch(url, { method: 'DELETE' });
    await parseConfluxResponse(res);
  },

  async getFolder(orgId: number | string, folderId: string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId);
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async updateFolder(
    orgId: number | string,
    folderId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId);
    const res = await confluxFetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async deleteFolder(orgId: number | string, folderId: string): Promise<void> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId);
    const res = await confluxFetch(url, { method: 'DELETE' });
    await parseConfluxResponse(res);
  },

  async getFolderPermissions(orgId: number | string, folderId: string): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId, 'permissions');
    const res = await confluxFetch(url, { method: 'GET' });
    return parseConfluxResponse(res);
  },

  async assignFolderPermission(
    orgId: number | string,
    folderId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId, 'permissions');
    const res = await confluxFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },

  async removeFolderPermission(
    orgId: number | string,
    folderId: string,
    roleId: string,
  ): Promise<void> {
    const url = fyersOrgResearchUrl(orgId, R.folders, folderId, 'permissions', roleId);
    const res = await confluxFetch(url, { method: 'DELETE' });
    await parseConfluxResponse(res);
  },

  async updateDocument(
    orgId: number | string,
    documentId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = fyersOrgResearchUrl(orgId, R.documents, documentId);
    const res = await confluxFetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return parseConfluxResponse(res);
  },
};
