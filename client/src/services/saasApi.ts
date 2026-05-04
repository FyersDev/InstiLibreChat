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
 * JWT `org_id` claim). Auth, org directory, users, roles, permissions, and personas still use
 * `GET/POST ${base}/api/v1/...` via the local proxy.
 */

import {
  getFyersOrgIdFromJwt,
  hasFyersResearchAuth,
  researchConfluxApi,
} from '~/services/researchConfluxApi';

function requireConfluxOrg(orgId?: string | null): string {
  if (!hasFyersResearchAuth()) {
    throw new Error(
      'FYERS T2 API requires an INSTI~ JWT (localStorage _INSTI, or access_token starting with INSTI~)',
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

/** Build same-origin static file URL (matches `FileViewRoute` / `uploads` prefix rules). */
function staticResourceUrlFromStorageKey(storageKey: string): string {
  const storagePath = 'uploads';
  let filePath = storageKey;
  if (filePath.startsWith(`${storagePath}/`)) {
    filePath = filePath.substring(storagePath.length + 1);
  } else if (filePath.startsWith(`/${storagePath}/`)) {
    filePath = filePath.substring(storagePath.length + 2);
  } else if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  filePath = filePath.replace(/\\/g, '/');
  return `/static/resources/folder/file/${filePath}`;
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

/** Explicit `orgId` from caller wins; otherwise use `org_id` from the FYERS JWT payload. */
function effectiveConfluxOrgId(orgId?: string | null): string | null {
  const trimmed = orgId != null && String(orgId).trim() !== '' ? String(orgId).trim() : null;
  if (trimmed) {
    return trimmed;
  }
  return getFyersOrgIdFromJwt();
}

function mapConfluxDocToFileNode(row: Record<string, unknown>): Record<string, unknown> {
  const docId = row.documentId ?? row.document_id ?? row.id;
  const idStr = docId != null ? String(docId) : '';
  return {
    id: idStr,
    document_id: idStr,
    name: String(row.name ?? ''),
    extension: row.extension != null ? String(row.extension) : undefined,
    size_bytes: typeof row.sizeBytes === 'number' ? row.sizeBytes : row.size_bytes,
    created_at: String(row.createdAt ?? row.created_at ?? ''),
    storage_key: String(row.storagePath ?? row.storage_key ?? ''),
    created_by: row.createdBy ?? row.created_by,
    created_by_name: row.createdByName ?? row.created_by_name,
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
      result.push({
        id,
        name,
        path,
        parent_id: parentRaw != null ? String(parentRaw) : parentFolderId ?? undefined,
        children,
        files,
        created_at: String(f.createdAt ?? f.created_at ?? ''),
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
    return researchConfluxApi.createTemplate(org, data);
  },

  async updateTemplate(id: string, data: any, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    return researchConfluxApi.updateTemplate(org, id, data);
  },

  async deleteTemplate(id: string, orgId?: string | null) {
    const org = requireConfluxOrg(orgId);
    await researchConfluxApi.deleteTemplate(org, id);
  },

  // Personas
  async getPersonas() {
    const url = `${API_BASE_URL}/personas?limit=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, { url, method: 'GET' });
  },

  async createPersona(data: any) {
    const url = `${API_BASE_URL}/personas`;
    const method = 'POST';
    const body = JSON.stringify(data);
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body,
    });
    return handleResponse(response, { url, method, body });
  },

  async updatePersona(id: string, data: any) {
    const url = `${API_BASE_URL}/personas/${id}`;
    const method = 'PUT';
    const body = JSON.stringify(data);
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body,
    });
    return handleResponse(response, { url, method, body });
  },

  async deletePersona(id: string) {
    const url = `${API_BASE_URL}/personas/${id}`;
    const method = 'DELETE';
    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
    });
    return handleResponse(response, { url, method });
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
    const meta = normalizeConfluxDocumentMetadata(
      await researchConfluxApi.getDocument(org, id),
    );
    const storageKey =
      meta.storage_key != null
        ? String(meta.storage_key)
        : meta.storagePath != null
          ? String(meta.storagePath)
          : '';
    if (!storageKey) {
      throw new Error('Document has no storage path — cannot download');
    }
    const staticUrl = staticResourceUrlFromStorageKey(storageKey);
    const token = getAuthToken();
    const response = await fetch(staticUrl, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed to download file: ${response.statusText} - ${errorText}`);
    }
    return response.blob();
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

