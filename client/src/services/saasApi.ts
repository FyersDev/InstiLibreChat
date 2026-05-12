/**
 * Facade over **FYERS api-t2** org research (`researchConfluxApi`) plus `GET /insti/admin/user-details`.
 * Same-origin `/api/v1/*` (insti-inquora directory, OTP, refresh) was removed from this client.
 *
 * Requires an `INSTI~` JWT and (for org-scoped calls) a numeric org id from the token or arguments.
 */

import { fyersT2Urls } from '~/constants/api_list';
import {
  getFyersOrgIdFromJwt,
  getFyersResearchAuthHeaders,
  hasFyersResearchAuth,
  type PredefinedResearchAgent,
  type PredefinedResearchFramework,
  researchConfluxApi,
} from '~/services/researchConfluxApi';

/** Full URL for SPA chat home (respects `<base href>`). Used instead of removed `/login`. */
function spaChatHomeHref(): string {
  let base = document.querySelector('base')?.getAttribute('href') || '/';
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  return `${base}/c/new`;
}

/** User-facing copy for FYERS `fetch` failures (avoid leaking server details). */
const FYERS_REQUEST_FAILED =
  'Request failed. Please try again, or sign in again if the problem continues.';

function requireConfluxOrg(orgId?: string | null): string {
  if (!hasFyersResearchAuth()) {
    throw new Error(
      'FYERS T2 API requires an INSTI~ JWT (cookie _INSTI, localStorage _INSTI, or access_token starting with INSTI~)',
    );
  }
  const org = effectiveConfluxOrgId(orgId);
  if (!org) {
    throw new Error(
      'Organization id is required — pass org_id or use an INSTI~ JWT with an org_id claim',
    );
  }
  return org;
}

function normalizeConfluxDocumentMetadata(raw: unknown): Record<string, unknown> {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const path = row.storagePath ?? row.storage_key;
  return {
    ...row,
    ...(path != null ? { storage_key: String(path) } : {}),
  };
}

/**
 * FYERS `PUT /research/templates/{id}` — strict camelCase body, e.g.
 * `{ name, description?, framework, isCustom, content }`. UI may send `is_custom`; we emit `isCustom`.
 */
function normalizeConfluxTemplateWrite(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const d = data && typeof data === 'object' ? data : {};
  const out: Record<string, unknown> = {};
  if (d.name != null) {
    out.name = d.name;
  }
  if (d.description != null) {
    out.description = d.description;
  }
  if (d.framework != null) {
    out.framework = d.framework;
  }
  const isCustom =
    d.isCustom !== undefined
      ? Boolean(d.isCustom)
      : d.is_custom !== undefined
        ? Boolean(d.is_custom)
        : undefined;
  if (typeof isCustom === 'boolean') {
    out.isCustom = isCustom;
  }
  if (d.content != null && typeof d.content === 'object' && !Array.isArray(d.content)) {
    out.content = d.content;
  } else {
    out.content = {};
  }
  return out;
}

/**
 * FYERS `PUT /research/personas/{id}` — snake_case body, e.g.
 * `{ name, description?, template_id, is_custom_template, content }`.
 * `template_id` may be `null` (no linked template). Create flows often omit `template_id`; updates may pass null explicitly.
 */
function normalizeConfluxPersonaWrite(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const d = data && typeof data === 'object' ? data : {};
  const out: Record<string, unknown> = {};

  if (d.name != null) {
    out.name = d.name;
  }
  if (d.description != null) {
    out.description = d.description;
  }

  const hasTemplateIdKey =
    Object.prototype.hasOwnProperty.call(d, 'template_id') ||
    Object.prototype.hasOwnProperty.call(d, 'templateId');
  const tid = d.template_id ?? d.templateId;
  if (hasTemplateIdKey) {
    out.template_id =
      tid != null && tid !== '' ? (typeof tid === 'number' ? String(tid) : String(tid).trim()) : null;
  } else if (tid != null && tid !== '') {
    out.template_id = typeof tid === 'number' ? String(tid) : String(tid).trim();
  }

  const customExplicit = d.is_custom_template ?? d.isCustomTemplate;
  out.is_custom_template =
    typeof customExplicit === 'boolean' ? customExplicit : true;

  if (d.content != null && typeof d.content === 'object' && !Array.isArray(d.content)) {
    out.content = d.content;
  } else {
    out.content = {};
  }

  return out;
}

/**
 * Normalize API response structure
 * Handles both response formats:
 * 1. insti-inquora: { code: 200, s: "ok", data: {...}, message: "..." }
 * 2. saas-api: { access_token, refresh_token, user, ... } (flat structure)
 */
function normalizeResponse<T>(data: any): T {
  // If response has 'data' field (insti-inquora format), extract it
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data as T;
  }
  // Otherwise return as-is (saas-api format)
  return data as T;
}

/**
 * Resolves the org id for **FYERS Conflux** URLs (`/insti/admin/org/{orgId}/research/...`).
 * The API accepts the numeric FYERS `org_id` from the `INSTI~` JWT. Callers may pass a synthetic
 * org id from `getOrganizations`; we only honor an explicit `orgId` when it is all digits;
 * otherwise we use `org_id` from the JWT.
 */
function effectiveConfluxOrgId(orgId?: string | null): string | null {
  const fromJwt = getFyersOrgIdFromJwt();
  const trimmed = orgId != null && String(orgId).trim() !== '' ? String(orgId).trim() : null;

  if (trimmed && /^\d+$/.test(trimmed)) {
    return trimmed;
  }
  if (fromJwt) {
    return fromJwt;
  }
  return null;
}

function sortBySortOrder<T extends { sortOrder?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function normalizePredefinedAgentRow(raw: unknown): PredefinedResearchAgent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const agentIdRaw = r.agentId ?? r.agent_id;
  const name = r.name;
  const template = r.template;
  if (typeof agentIdRaw !== 'string' || !agentIdRaw.trim()) {
    return null;
  }
  if (typeof name !== 'string' || typeof template !== 'string') {
    return null;
  }
  const variables = Array.isArray(r.variables)
    ? (r.variables as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const sortOrder =
    typeof r.sortOrder === 'number'
      ? r.sortOrder
      : typeof r.sort_order === 'number'
        ? r.sort_order
        : undefined;
  const out: PredefinedResearchAgent = {
    agentId: agentIdRaw.trim(),
    name,
    template,
    variables,
  };
  if (typeof r.description === 'string') {
    out.description = r.description;
  }
  if (sortOrder !== undefined) {
    out.sortOrder = sortOrder;
  }
  if (typeof r.createdAt === 'string') {
    out.createdAt = r.createdAt;
  }
  if (typeof r.updatedAt === 'string') {
    out.updatedAt = r.updatedAt;
  }
  return out;
}

function normalizePredefinedAgentsPayload(raw: unknown): PredefinedResearchAgent[] {
  const p = raw as Record<string, unknown> | null;
  if (!p) {
    return [];
  }
  const list = p.agents;
  if (!Array.isArray(list)) {
    return [];
  }
  const rows = list
    .map((row) => normalizePredefinedAgentRow(row))
    .filter((x): x is PredefinedResearchAgent => x != null);
  return sortBySortOrder(rows);
}

function normalizePredefinedFrameworkRow(raw: unknown): PredefinedResearchFramework | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const frameworkIdRaw = r.frameworkId ?? r.framework_id;
  const code = r.code;
  const name = r.name;
  const fieldsRaw = r.fields;
  if (typeof frameworkIdRaw !== 'string' || !frameworkIdRaw.trim()) {
    return null;
  }
  if (typeof code !== 'string' || !code.trim() || typeof name !== 'string') {
    return null;
  }
  const fields: Record<string, string> = {};
  if (fieldsRaw && typeof fieldsRaw === 'object' && !Array.isArray(fieldsRaw)) {
    for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
      if (typeof v === 'string') {
        fields[k] = v;
      }
    }
  }
  const sortOrder =
    typeof r.sortOrder === 'number'
      ? r.sortOrder
      : typeof r.sort_order === 'number'
        ? r.sort_order
        : undefined;
  const out: PredefinedResearchFramework = {
    frameworkId: frameworkIdRaw.trim(),
    code: code.trim(),
    name,
    fields,
  };
  if (sortOrder !== undefined) {
    out.sortOrder = sortOrder;
  }
  if (typeof r.createdAt === 'string') {
    out.createdAt = r.createdAt;
  }
  if (typeof r.updatedAt === 'string') {
    out.updatedAt = r.updatedAt;
  }
  return out;
}

function normalizePredefinedFrameworksPayload(raw: unknown): PredefinedResearchFramework[] {
  const p = raw as Record<string, unknown> | null;
  if (!p) {
    return [];
  }
  const list = p.frameworks;
  if (!Array.isArray(list)) {
    return [];
  }
  const rows = list
    .map((row) => normalizePredefinedFrameworkRow(row))
    .filter((x): x is PredefinedResearchFramework => x != null);
  return sortBySortOrder(rows);
}

/** Maps FYERS `GET /insti/admin/user-details` payload to fields used across InstiLibreChat (`org_id`, `org_role`, …). */
function mapFyersUserDetailsToMe(raw: Record<string, unknown>): Record<string, unknown> {
  const roleRaw = String(raw.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  let org_role: string | undefined;
  let is_super_admin = false;

  if (roleRaw.includes('super') && roleRaw.includes('admin')) {
    is_super_admin = true;
    org_role = 'admin';
  } else if (roleRaw === 'org_admin' || roleRaw === 'orgadmin') {
    org_role = 'admin';
  } else if (roleRaw === 'viewer') {
    org_role = 'viewer';
  } else if (roleRaw === 'admin') {
    org_role = 'admin';
  } else if (roleRaw) {
    org_role = roleRaw;
  }

  const institutionId = raw.institutionId ?? raw.institution_id;
  const jwtOrg = getFyersOrgIdFromJwt();
  const org_id =
    jwtOrg ??
    (institutionId != null && institutionId !== ''
      ? String(institutionId as string | number)
      : undefined);

  const id = raw.id != null ? String(raw.id as string | number) : undefined;

  return {
    ...raw,
    id,
    name: raw.name,
    email: raw.email,
    mobile: raw.mobile,
    fyId: raw.fyId ?? raw.fy_id,
    org_id,
    organization_id: org_id,
    org_role,
    orgRole: org_role,
    is_super_admin,
    institutionId,
    institutionName: raw.institutionName ?? raw.institution_name,
    deptId: raw.deptId ?? raw.dept_id,
    deptName: raw.deptName ?? raw.dept_name,
    subDeptId: raw.subDeptId ?? raw.sub_dept_id,
    subDeptName: raw.subDeptName ?? raw.sub_dept_name,
    jobTitle: raw.jobTitle ?? raw.job_title,
    status: raw.status,
    lastActive: raw.lastActive ?? raw.last_active,
    licenseStartDate: raw.licenseStartDate ?? raw.license_start_date,
    licenseEndDate: raw.licenseEndDate ?? raw.license_end_date,
  };
}

/** Maps FYERS research v1.1 `createdByName` / `created_by_name` (and processor snake_case). */
function pickCreatorDisplayName(row: Record<string, unknown>): string | undefined {
  const n = row.createdByName ?? row.created_by_name;
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
}

function pickCreatorEmail(row: Record<string, unknown>): string | undefined {
  const e = row.createdByEmail ?? row.created_by_email;
  return typeof e === 'string' && e.trim() ? e.trim() : undefined;
}

function mapConfluxDocToFileNode(row: Record<string, unknown>): Record<string, unknown> {
  const docId = row.documentId ?? row.document_id ?? row.id;
  const idStr = docId != null ? String(docId) : '';
  const hasOrgKey = 'orgId' in row || 'org_id' in row;
  const orgRaw = row.orgId ?? row.org_id;
  let org_id: string | null | undefined;
  if (!hasOrgKey) {
    org_id = undefined;
  } else if (orgRaw === null || orgRaw === '') {
    org_id = null;
  } else {
    org_id = String(orgRaw);
  }
  const is_system =
    row.isSystem === true ||
    row.is_system === true ||
    (hasOrgKey && (orgRaw === null || orgRaw === ''));
  const ownerName = pickCreatorDisplayName(row);
  const ownerEmail = pickCreatorEmail(row);
  const nameStr = String(row.name ?? '');
  let extension: string | undefined =
    row.extension != null && String(row.extension) !== '' ? String(row.extension) : undefined;
  if (!extension && nameStr.includes('.')) {
    extension = nameStr.slice(nameStr.lastIndexOf('.') + 1).toLowerCase();
  }
  if (!extension) {
    const mt = String(row.mimeType ?? row.mime_type ?? '').toLowerCase();
    if (mt === 'application/pdf') {
      extension = 'pdf';
    } else if (mt === 'text/csv' || mt === 'application/csv') {
      extension = 'csv';
    } else if (mt === 'text/plain') {
      extension = 'txt';
    } else if (mt.startsWith('image/')) {
      const sub = mt.split('/')[1];
      if (sub === 'jpeg') {
        extension = 'jpg';
      } else if (sub) {
        extension = sub;
      }
    }
  }
  return {
    id: idStr,
    document_id: idStr,
    name: nameStr,
    extension,
    folder_id:
      row.folderId !== undefined || row.folder_id !== undefined
        ? String(row.folderId ?? row.folder_id)
        : undefined,
    size_bytes: typeof row.sizeBytes === 'number' ? row.sizeBytes : row.size_bytes,
    created_at: String(row.createdAt ?? row.created_at ?? ''),
    storage_key: String(row.storagePath ?? row.storage_key ?? ''),
    created_by:
      row.createdBy !== undefined || row.created_by !== undefined
        ? String(row.createdBy ?? row.created_by)
        : undefined,
    created_by_name: ownerName,
    created_by_email: ownerEmail,
    org_id,
    is_system,
    uploaded_at: String(row.updatedAt ?? row.uploadedAt ?? row.createdAt ?? ''),
    status: String(row.status ?? 'PENDING'),
    error_message:
      row.errorMessage != null && String(row.errorMessage).trim() !== ''
        ? String(row.errorMessage)
        : row.error_message != null && String(row.error_message).trim() !== ''
          ? String(row.error_message)
          : undefined,
  };
}

/** Result of `GET .../research/hierarchy` mapped to app folder/file nodes. */
export type ResearchFolderTreeResult = {
  folders: any[];
  rootFiles: any[];
};

function mapConfluxFolderRecord(
  f: Record<string, unknown>,
  scopeOrgId?: string,
): {
  id: string;
  name: string;
  path: string;
  parent_id?: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
  created_by_email?: string;
  org_id: string | null | undefined;
  is_system: boolean;
  folder_kind?: string;
  rename_locked: boolean;
  status?: string;
} {
  const id = String(f.folderId ?? f.id ?? f.folder_id ?? '');
  const name = String(f.name ?? '');
  const path = String(f.path ?? '');
  const parentRaw = f.parentFolderId ?? f.parent_id;
  const parent_id =
    parentRaw != null && String(parentRaw) !== '' ? String(parentRaw) : undefined;
  const hasOrgKey = 'orgId' in f || 'org_id' in f;
  const folderOrgRaw = f.orgId ?? f.org_id;
  let folder_org_id: string | null | undefined;
  if (!hasOrgKey) {
    folder_org_id =
      scopeOrgId != null && String(scopeOrgId).trim() !== '' ? String(scopeOrgId) : undefined;
  } else if (folderOrgRaw === null || folderOrgRaw === '') {
    folder_org_id = null;
  } else {
    folder_org_id = String(folderOrgRaw);
  }
  const is_system =
    f.isSystem === true ||
    f.is_system === true ||
    (hasOrgKey && (folderOrgRaw === null || folderOrgRaw === ''));
  const folderOwnerName = pickCreatorDisplayName(f);
  const folderOwnerEmail = pickCreatorEmail(f);
  const folderKindRaw =
    f.folderKind ??
    f.folder_kind ??
    f.kind ??
    f.category ??
    f.purpose ??
    f.folderType ??
    f.folder_type;
  const folder_kind =
    typeof folderKindRaw === 'string' && folderKindRaw.trim()
      ? folderKindRaw.trim().toLowerCase()
      : undefined;
  const rename_locked = f.renameLocked === true || f.rename_locked === true;
  const statusRaw = f.status ?? f.folderStatus ?? f.folder_status;
  const status =
    statusRaw != null && String(statusRaw).trim() !== '' ? String(statusRaw).trim() : undefined;
  return {
    id,
    name,
    path,
    parent_id,
    created_at: String(f.createdAt ?? f.created_at ?? ''),
    created_by:
      f.createdBy !== undefined || f.created_by !== undefined
        ? String(f.createdBy ?? f.created_by)
        : undefined,
    created_by_name: folderOwnerName,
    created_by_email: folderOwnerEmail,
    org_id: folder_org_id,
    is_system,
    folder_kind,
    rename_locked,
    status,
  };
}

/** Maps one hierarchy branch `{ folder, documents, folders }` to a client folder node. */
function mapHierarchyFolderBranch(node: Record<string, unknown>, scopeOrgId?: string): any | null {
  const folderRaw = node.folder;
  if (!folderRaw || typeof folderRaw !== 'object') {
    return null;
  }
  const f = folderRaw as Record<string, unknown>;
  const nested = (Array.isArray(node.folders) ? node.folders : []) as Record<string, unknown>[];
  const docs = (Array.isArray(node.documents) ? node.documents : []) as Record<string, unknown>[];
  const children = nested
    .map((child) => mapHierarchyFolderBranch(child, scopeOrgId))
    .filter(Boolean);
  const files = docs.map((d) => mapConfluxDocToFileNode(d));
  const meta = mapConfluxFolderRecord(f, scopeOrgId);
  const documentCountRaw = node.documentCount ?? node.document_count;
  const totalDocumentCountRaw = node.totalDocumentCount ?? node.total_document_count;
  const subFolderCountRaw = node.subFolderCount ?? node.sub_folder_count;
  const totalSubFolderCountRaw = node.totalSubFolderCount ?? node.total_sub_folder_count;

  const document_count =
    typeof documentCountRaw === 'number'
      ? documentCountRaw
      : Number.isFinite(Number(documentCountRaw))
        ? Number(documentCountRaw)
        : undefined;
  const total_document_count =
    typeof totalDocumentCountRaw === 'number'
      ? totalDocumentCountRaw
      : Number.isFinite(Number(totalDocumentCountRaw))
        ? Number(totalDocumentCountRaw)
        : undefined;
  const sub_folder_count =
    typeof subFolderCountRaw === 'number'
      ? subFolderCountRaw
      : Number.isFinite(Number(subFolderCountRaw))
        ? Number(subFolderCountRaw)
        : undefined;
  const total_sub_folder_count =
    typeof totalSubFolderCountRaw === 'number'
      ? totalSubFolderCountRaw
      : Number.isFinite(Number(totalSubFolderCountRaw))
        ? Number(totalSubFolderCountRaw)
        : undefined;
  return {
    ...meta,
    children,
    files,
    document_count,
    total_document_count,
    sub_folder_count,
    total_sub_folder_count,
  };
}

/** Single GET `/research/hierarchy` → nested folders + root-level unfiled documents. */
const folderTreeInflight = new Map<string, Promise<ResearchFolderTreeResult>>();

async function confluxBuildFolderTree(orgId: string): Promise<ResearchFolderTreeResult> {
  const inflight = folderTreeInflight.get(orgId);
  if (inflight) {
    return inflight;
  }

  const promise = (async () => {
    const raw = await researchConfluxApi.getResearchHierarchy(orgId);
    const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const unfiled = (Array.isArray(payload.unfiledDocuments) ? payload.unfiledDocuments : []) as Record<
      string,
      unknown
    >[];
    const roots = (Array.isArray(payload.folders) ? payload.folders : []) as Record<string, unknown>[];
    const rootFiles = unfiled.map((d) => mapConfluxDocToFileNode(d));
    const folders = roots.map((n) => mapHierarchyFolderBranch(n, orgId)).filter(Boolean);
    return { folders, rootFiles };
  })();

  folderTreeInflight.set(orgId, promise);

  try {
    return await promise;
  } finally {
    if (folderTreeInflight.get(orgId) === promise) {
      folderTreeInflight.delete(orgId);
    }
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(FYERS_REQUEST_FAILED);
  }

  const data = await response.json();

  if (data && (data.logout === true || (data.data && data.data.logout === true))) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.setItem('auth_error', FYERS_REQUEST_FAILED);
    if (!/\/c\/new\/?$/.test(window.location.pathname)) {
      window.location.href = spaChatHomeHref();
    }
  }

  return normalizeResponse<T>(data);
}

export const saasApi = {
  async getMe() {
    if (!hasFyersResearchAuth()) {
      throw new Error(
        'FYERS research auth required (INSTI~ JWT). Complete your institutional sign-in flow.',
      );
    }
    const url = fyersT2Urls.instiAdminUserDetails;
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    const auth = getFyersResearchAuthHeaders();
    if ('Authorization' in auth && auth.Authorization) {
      headers.set('Authorization', auth.Authorization as string);
    }
    const response = await fetch(url, { method: 'GET', headers });
    const raw = await handleResponse<Record<string, unknown>>(response);
    return mapFyersUserDetailsToMe(raw ?? {});
  },

  /**
   * Single org derived from FYERS user-details (directory org list API removed).
   */
  async getOrganizations(_isSuperAdmin?: boolean, _orgFilter?: string) {
    const me = (await this.getMe()) as Record<string, unknown>;
    const id = me.organization_id ?? me.org_id;
    if (id == null || String(id).trim() === '') {
      return [];
    }
    const inst = me.institutionName;
    const name =
      typeof inst === 'string' && inst.trim() ? inst.trim() : 'Organization';
    return [{ id: String(id), name }];
  },

  // Templates (FYERS T2 org research list/create + REST by id)
  async getTemplates(orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listTemplates(org);
    const p = raw as Record<string, unknown> | null;
    if (Array.isArray(raw)) {
      return { data: raw };
    }
    if (p && Array.isArray(p.templates)) {
      return { data: p.templates };
    }
    if (p && Array.isArray(p.data)) {
      return p;
    }
    return { data: [] };
  },

  async createTemplate(data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId ?? data?.org_id);
    const body = normalizeConfluxTemplateWrite(
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    );
    return researchConfluxApi.createTemplate(org, body);
  },

  async updateTemplate(id: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const body = normalizeConfluxTemplateWrite(
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    );
    return researchConfluxApi.updateTemplate(org, id, body);
  },

  async deleteTemplate(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deleteTemplate(org, id);
  },

  // Personas (FYERS T2 / insti-conflux-users — same pattern as templates)
  async getPersonas(orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listPersonas(org);
    const p = raw as Record<string, unknown> | null;
    if (Array.isArray(raw)) {
      return { data: raw };
    }
    if (p && Array.isArray(p.personas)) {
      return { data: p.personas };
    }
    if (p && Array.isArray(p.data)) {
      return p;
    }
    return { data: [] };
  },

  async createPersona(data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId ?? data?.org_id);
    const body = normalizeConfluxPersonaWrite(
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    );
    return researchConfluxApi.createPersona(org, body);
  },

  async updatePersona(id: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId ?? data?.org_id);
    const body = normalizeConfluxPersonaWrite(
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    );
    return researchConfluxApi.updatePersona(org, id, body);
  },

  async deletePersona(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deletePersona(org, id);
  },

  async getPredefinedAgents(orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listPredefinedAgents(org);
    const data = normalizePredefinedAgentsPayload(raw);
    return { data };
  },

  async getPredefinedAgent(agentId: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.getPredefinedAgent(org, agentId);
    const row = normalizePredefinedAgentRow(raw);
    if (!row) {
      throw new Error('Invalid predefined agent response');
    }
    return row;
  },

  async getPredefinedFrameworks(orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listPredefinedFrameworks(org);
    const data = normalizePredefinedFrameworksPayload(raw);
    return { data };
  },

  async getPredefinedFramework(frameworkId: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.getPredefinedFramework(org, frameworkId);
    const row = normalizePredefinedFrameworkRow(raw);
    if (!row) {
      throw new Error('Invalid predefined framework response');
    }
    return row;
  },

  // Folders (FYERS T2 / insti-conflux-users only)
  async getFolders(parentId?: string) {
    const org = requireConfluxOrg();
    return researchConfluxApi.listFolders(org, parentId);
  },

  async getFolderTree(orgId?: string | null): Promise<ResearchFolderTreeResult> {
    const org = requireConfluxOrg(orgId);
    return confluxBuildFolderTree(org);
  },

  async getFolder(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.getFolder(org, id);
  },

  async downloadFile(id: string, orgId?: string | null): Promise<Blob> {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.downloadDocument(org, id);
  },

  /**
   * Triggers a browser download for the document.
   *
   * **CORS:** For a plain GET presigned URL (typical S3), we use `<a href={url} download>` so the
   * browser performs a **navigation-style** request to S3 — not `fetch()` — so **bucket CORS does not
   * apply** the same way as XHR. If the API returns a non-GET presigned request or extra headers, we
   * fall back to `fetch` + Blob (that path **does** require S3 CORS for your web origin, or a server proxy).
   *
   * Other approaches: `openDocumentDownloadInNewTab` (view in tab); same-tab `location.assign`
   * (leaves the SPA).
   */
  async downloadDocumentWithBrowser(
    id: string,
    orgId?: string | null,
    filename?: string,
  ): Promise<void> {
    const org = requireConfluxOrg(orgId);
    const safeName = filename?.trim() ? filename.trim() : `document-${id}`;
    const p = await researchConfluxApi.getDocumentDownloadPresigned(org, id);
    const method = (p.method || 'GET').toUpperCase();
    const headerCount = p.headers ? Object.keys(p.headers).length : 0;

    if (method === 'GET' && headerCount === 0) {
      const a = document.createElement('a');
      a.href = p.url;
      a.setAttribute('download', safeName);
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const blob = await researchConfluxApi.downloadDocument(org, id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  /**
   * Opens the presigned URL in a new tab (often used to view PDFs in-browser).
   * Opens a placeholder tab synchronously before `await` to reduce popup blocking.
   * Prefer `downloadDocumentWithBrowser` when you only need a file save and popups are unreliable.
   */
  async openDocumentDownloadInNewTab(id: string, orgId?: string | null): Promise<void> {
    const org = requireConfluxOrg(orgId);
    const newTab = window.open('about:blank', '_blank');
    if (!newTab) {
      throw new Error(
        'Could not open a new tab for download. Allow popups for this site and try again.',
      );
    }
    try {
      const p = await researchConfluxApi.getDocumentDownloadPresigned(org, id);
      newTab.location.assign(p.url);
    } catch (e) {
      newTab.close();
      throw e;
    }
  },

  async createFolder(data: any) {
    const org = requireConfluxOrg(data?.org_id);
    const parent = data.parent_id;
    const parentNum =
      parent != null && parent !== '' ? Number(parent) : NaN;
    return researchConfluxApi.createFolder(org, {
      name: data.name,
      parentFolderId: Number.isFinite(parentNum) ? parentNum : null,
    });
  },

  async updateFolder(id: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.updateFolder(org, id, data);
  },

  async deleteFolder(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deleteFolder(org, id);
  },

  async getFolderPermissions(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.getFolderPermissions(org, id);
  },

  async assignFolderPermission(folderId: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.assignFolderPermission(org, folderId, data);
  },

  async removeFolderPermission(folderId: string, roleId: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.removeFolderPermission(org, folderId, roleId);
  },

  // Documents / files (FYERS T2 only)
  /**
   * FYERS `GET .../research/reports` — flat list of saved report PDFs (`data.reports`).
   * Download/delete use the same document endpoints as other research files.
   */
  async listResearchReports(orgId?: string | null): Promise<{ reports: Record<string, unknown>[] }> {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listReports(org);
    const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    let items: unknown[] = [];
    if (Array.isArray(payload.reports)) {
      items = payload.reports;
    } else {
      const nested = payload.data;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const dr = (nested as Record<string, unknown>).reports;
        if (Array.isArray(dr)) {
          items = dr;
        }
      }
    }
    return {
      reports: items.map((row) => mapConfluxDocToFileNode(row as Record<string, unknown>)),
    };
  },

  async getFiles(folderId?: string, page = 1, limit = 1000, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.listDocuments(org, {
      folderId: folderId,
      scope: folderId ? undefined : 'all',
    });
    const payload = raw as Record<string, unknown>;
    const docs = (Array.isArray(payload.documents) ? payload.documents : []) as Record<
      string,
      unknown
    >[];
    return {
      documents: docs.map((d) => mapConfluxDocToFileNode(d)),
      page,
      limit,
      total_count: docs.length,
    } as any;
  },

  async getFile(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    const raw = await researchConfluxApi.getDocument(org, id);
    return normalizeConfluxDocumentMetadata(raw);
  },

  async createFile(_data: any) {
    throw new Error('createFile is not supported for FYERS T2 — use uploadFile(file, folderId, orgId)');
  },

  async uploadFile(file: File, folderId?: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.documentUpload(org, file, {
      folderId: folderId,
    });
  },

  /**
   * PDF report upload — `POST /insti/admin/org/:orgId/research/save-report-upload` (multipart: `file`, optional `metadata` JSON).
   * Response `data.id` is `documentId` for {@link downloadDocumentWithBrowser} / {@link deleteFile}.
   */
  async saveReport(file: File, orgId?: string | null, metadata?: any) {
    if (!file) {
      throw new Error('File is required for saveReport');
    }
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.saveReportUpload(org, file, metadata);
  },

  async updateFile(id: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.updateDocument(org, id, data);
  },

  /** Soft-delete — `DELETE /insti/admin/org/:orgId/research/documents/:documentId` (204). */
  async deleteFile(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deleteDocument(org, id);
  },

  /** `POST .../documents/:documentId/doc-processor-notify` — retry failed doc processor upload notify. */
  async retryDocumentProcessor(documentId: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.docProcessorNotify(org, documentId);
  },
};

