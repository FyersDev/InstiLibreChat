/**
 * API Service for insti-inquora backend
 * 
 * This service connects to the insti-inquora API (Go backend) through the proxy.
 * All requests are sent to /api/v1/* which routes to:
 *   - insti-inquora backend (port 3001) for most API calls
 *   - Handles authentication, documents, folders, users, organizations, etc.
 * 
 * The service handles both response formats:
 *   - insti-inquora: { code: 200, s: "ok", data: {...}, message: "..." }
 *   - Legacy saas-api: { access_token, refresh_token, user, ... } (flat structure)
 *
 * **Document, folder, and org-scoped template** calls use **FYERS api-t2** / insti-conflux-users
 * (`researchConfluxApi`) only — not `/api/v1`. Requires an `INSTI~` JWT and an org id (argument or
 * JWT `org_id` claim). Auth, org directory, users, roles, and permissions still use
 * `GET/POST ${base}/api/v1/...` via the local proxy. Personas and templates use FYERS Conflux.
 */

import { fyersT2Urls } from '~/constants/api_list';
import {
  getFyersOrgIdFromJwt,
  getFyersResearchAuthHeaders,
  hasFyersResearchAuth,
  researchConfluxApi,
} from '~/services/researchConfluxApi';

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
 * FYERS Conflux template create/update unmarshals strict JSON — rejects unknown keys such as
 * `is_custom` from CreateTemplateModal / TemplatesView.
 */
function normalizeConfluxTemplateWrite(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const d = data && typeof data === 'object' ? data : {};
  const out: Record<string, unknown> = {};
  if (d.name != null) {
    out.name = d.name;
  }
  if (d.framework != null) {
    out.framework = d.framework;
  }
  if (d.content != null) {
    out.content = d.content;
  }
  if (d.description != null) {
    out.description = d.description;
  }
  return out;
}

/**
 * FYERS org research persona POST/PUT — snake_case body: `template_id`, `is_custom_template`, `content`.
 * User-driven create/update defaults `is_custom_template` to true when not specified.
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

  const tid = d.template_id ?? d.templateId;
  if (tid != null && tid !== '') {
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

const getBaseHref = () => {
  const base = document.querySelector('base')?.getAttribute('href') || '/';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const API_BASE_URL = `${getBaseHref()}/api/v1`;

function getAuthToken(): string | null {
  return localStorage.getItem('access_token');
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
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
 * The API accepts the numeric FYERS `org_id` from the `INSTI~` JWT, not the directory UUID from
 * `/api/v1` organizations. Callers often pass `organization.id` (UUID); we only honor an explicit
 * `orgId` when it is all digits; otherwise we use `org_id` from the JWT.
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
  return {
    id: idStr,
    document_id: idStr,
    name: String(row.name ?? ''),
    extension: row.extension != null ? String(row.extension) : undefined,
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
    status: String(row.status ?? 'Completed'),
  };
}

/** Builds a nested folder tree + per-folder documents (Conflux has no single `/folders/tree`). */
async function confluxBuildFolderTree(orgId: string): Promise<any[]> {
  const loadLevel = async (parentFolderId?: string): Promise<any[]> => {
    const raw = await researchConfluxApi.listFolders(orgId, parentFolderId);
    const payload = raw as Record<string, unknown>;
    const folders = (Array.isArray(payload.folders) ? payload.folders : []) as Record<
      string,
      unknown
    >[];
    const result: any[] = [];
    for (const f of folders) {
      const id = String(f.folderId ?? f.id ?? f.folder_id ?? '');
      const name = String(f.name ?? '');
      const path = String(f.path ?? '');
      const parentRaw = f.parentFolderId ?? f.parent_id;
      const children = await loadLevel(id);
      let files: any[] = [];
      try {
        const docsRaw = await researchConfluxApi.listDocuments(orgId, { folderId: id });
        const docsPayload = docsRaw as Record<string, unknown>;
        const docs = (Array.isArray(docsPayload.documents)
          ? docsPayload.documents
          : []) as Record<string, unknown>[];
        files = docs.map((d) => mapConfluxDocToFileNode(d));
      } catch {
        files = [];
      }
      const hasOrgKey = 'orgId' in f || 'org_id' in f;
      const folderOrgRaw = f.orgId ?? f.org_id;
      let folder_org_id: string | null | undefined;
      if (!hasOrgKey) {
        folder_org_id = undefined;
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
      result.push({
        id,
        name,
        path,
        parent_id: parentRaw != null ? String(parentRaw) : parentFolderId ?? undefined,
        children,
        files,
        created_at: String(f.createdAt ?? f.created_at ?? ''),
        created_by:
          f.createdBy !== undefined || f.created_by !== undefined
            ? String(f.createdBy ?? f.created_by)
            : undefined,
        created_by_name: folderOwnerName,
        created_by_email: folderOwnerEmail,
        org_id: folder_org_id,
        is_system,
      });
    }
    return result;
  };
  return loadLevel(undefined);
}

async function handleResponse<T>(response: Response, originalRequest?: { url: string; method: string; body?: string }, retry = true): Promise<T> {
  if (!response.ok) {
    // Check for "Session invalidated" or user suspension messages from Go backend
    try {
      const errorData = await response.clone().json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.error || '';
      
      // Check for session invalidation (including user suspension)
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes('session invalidated') || 
          lowerMessage.includes('invalidated all sessions') ||
          lowerMessage.includes('suspended user') ||
          lowerMessage.includes('user is suspended') ||
          lowerMessage.includes('account suspended') ||
          lowerMessage.includes('account has been suspended')) {
        console.log('Session invalidated by backend (user may be suspended), Logging out...');
        
        // Clear tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        
        // Store error message to display on login page
        sessionStorage.setItem('auth_error', errorMessage);
        
        // Redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(new Error(errorMessage));
      }
      
      // Also check for 403 Forbidden with suspension-related messages
      if (response.status === 403 && (
          lowerMessage.includes('suspended') ||
          lowerMessage.includes('banned') ||
          lowerMessage.includes('disabled'))) {
        console.log('User account suspended/banned, Logging out...');
        
        // Clear tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        
        // Store error message to display on login page
        sessionStorage.setItem('auth_error', errorMessage || 'Your account has been suspended. Please contact support.');
        
        // Redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(new Error(errorMessage));
      }
    } catch (e) {
      // Continue with normal error handling if parsing fails
    }
    
    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && retry && originalRequest) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (refreshResponse.ok) {
            const refreshData: any = await refreshResponse.json();
            // Handle both response formats for access_token
            const normalizedRefreshData = normalizeResponse<any>(refreshData);
            
            // Check for access_token (can be in different formats)
            const accessToken = normalizedRefreshData.access_token || normalizedRefreshData.AccessToken;
            const refreshToken = normalizedRefreshData.refresh_token || normalizedRefreshData.RefreshToken;
            
            if (accessToken) {
              localStorage.setItem('access_token', accessToken);
              // Always update refresh_token if provided (even if same value)
              if (refreshToken) {
                localStorage.setItem('refresh_token', refreshToken);
              }
              // Retry the original request with new token
              const retryResponse = await fetch(originalRequest.url, {
                method: originalRequest.method as any,
                headers: {
                  ...getAuthHeaders(),
                  'Content-Type': 'application/json',
                },
                body: originalRequest.body,
              });
              return handleResponse(retryResponse, originalRequest, false); // Don't retry again
            } else {
              console.error('Refresh response missing access_token:', normalizedRefreshData);
            }
          } else {
            // Refresh token failed - get error details
            const errorData = await refreshResponse.json().catch(() => ({}));
            const errorMessage = errorData.message || errorData.error || 'Session expired. Please login again.';
            
            console.error('Token refresh failed:', {
              status: refreshResponse.status,
              error: errorMessage,
              details: errorData
            });
            
            // Clear tokens
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            
            // Don't redirect if we're already on the login page
            if (window.location.pathname.includes('/login')) {
              return Promise.reject(new Error(errorMessage));
            }
            
            // Show user-friendly error message before redirecting
            // Store error message in sessionStorage to display on login page if needed
            sessionStorage.setItem('auth_error', errorMessage);
            
            // Redirect to login
            window.location.href = '/login';
            return Promise.reject(new Error(errorMessage));
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          // Clear tokens on any error
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          
          const errorMessage = refreshError instanceof Error ? refreshError.message : 'Session expired. Please login again.';
          
          // Don't redirect if we're already on the login page
          if (window.location.pathname.includes('/login')) {
            return Promise.reject(new Error(errorMessage));
          }
          
          // Store error message to display on login page
          sessionStorage.setItem('auth_error', errorMessage);
          
          // Redirect to login
          window.location.href = '/login';
          return Promise.reject(new Error(errorMessage));
        }
      }
    }

    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    // Handle both 'message' and 'error' fields
    throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Check if the response contains a logout flag (user suspended, role changed, etc.)
  if (data && (data.logout === true || (data.data && data.data.logout === true))) {
    console.log('Logout flag detected in response, logging out user...');
    
    // Clear tokens
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // Store message to display on login page
    const message = data.message || data.data?.message || 'You have been logged out. Please log in again.';
    sessionStorage.setItem('auth_error', message);
    
    // Redirect to login if not already there
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }
  
  return normalizeResponse<T>(data);
}

export const saasApi = {
  // Auth endpoints
  async refreshToken(refreshToken: string) {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return handleResponse(response);
  },

  async getMe() {
    if (hasFyersResearchAuth()) {
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
      const raw = await handleResponse<Record<string, unknown>>(response, {
        url,
        method: 'GET',
      });
      return mapFyersUserDetailsToMe(raw ?? {});
    }

    const url = `${API_BASE_URL}/auth/me`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, { url, method: 'GET' });
  },

  // Organizations
  async getOrganizations(isSuperAdmin: boolean, orgId?: string) {
    // Both super admin and org admin use the same list endpoint
    // Backend distinguishes based on JWT claims (is_super_admin, org_id)
    // Super admin sees all orgs, org admin sees only their org
    const url = `${API_BASE_URL}/organizations?limit=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async createOrganization(data: any) {
    const response = await fetch(`${API_BASE_URL}/organizations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateOrganization(id: string, data: any) {
    const response = await fetch(`${API_BASE_URL}/organizations/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async deleteOrganization(id: string) {
    const response = await fetch(`${API_BASE_URL}/organizations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Users
  async getUsers(isSuperAdmin: boolean, orgId?: string) {
    // Both super admin and org admin use the same endpoint
    // Backend distinguishes based on JWT claims (is_super_admin, org_id)
    let url = `${API_BASE_URL}/users?limit=1000`;
    if (isSuperAdmin && orgId) {
      url += `&org_id=${orgId}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async createUser(data: any) {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateUser(id: string, data: any) {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async deleteUser(id: string) {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async getUserPermissions(id: string) {
    const response = await fetch(`${API_BASE_URL}/users/${id}/permissions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async assignRoleToUser(userId: string, roleId: string) {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/roles`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role_id: roleId }),
    });
    return handleResponse(response);
  },

  async removeRoleFromUser(userId: string, roleId: string) {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Roles
  async getRoles(orgFilterId?: string) {
    let url = `${API_BASE_URL}/roles`;
    if (orgFilterId) {
      url += `?org_id=${orgFilterId}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async createRole(data: any) {
    const response = await fetch(`${API_BASE_URL}/roles`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateRole(id: string, data: any) {
    const response = await fetch(`${API_BASE_URL}/roles/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async deleteRole(id: string) {
    const response = await fetch(`${API_BASE_URL}/roles/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async getRolePermissions(id: string) {
    const response = await fetch(`${API_BASE_URL}/roles/${id}/permissions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  async assignPermissionsToRole(roleId: string, permissionIds: string[]) {
    const response = await fetch(`${API_BASE_URL}/roles/${roleId}/permissions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ permission_ids: permissionIds }),
    });
    return handleResponse(response);
  },

  // Permissions
  async getPermissions() {
    const response = await fetch(`${API_BASE_URL}/permissions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
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

  // Folders (FYERS T2 / insti-conflux-users only)
  async getFolders(parentId?: string) {
    const org = requireConfluxOrg();
    return researchConfluxApi.listFolders(org, parentId);
  },

  async getFolderTree(orgId?: string | null) {
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

  async deleteFile(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deleteDocument(org, id);
  },
};

