/**
 * API registry for this client: FYERS **api-t2** (absolute URLs) and same-origin **Insti/inquora**
 * proxy paths under `/api/v1`.
 *
 * Used in-repo:
 * - `client/src/main.jsx` — `globalThis.__FYERS_T2_API__` (base, urls, list)
 * - `services/proxy/proxymain.go` — GET user-details (`FYERS_T2_INSTI_ADMIN_USER_DETAILS` overrides URL;
 *   default string should match `fyersT2Urls.instiAdminUserDetails`)
 * - `client/src/services/saasApi.ts` — same-origin fetches (compose with `getBaseHref()` + `API_V1_PATH`)
 * - `client/src/services/researchConfluxApi.ts` — `fyersOrgResearchUrl` + `FYERS_ORG_RESEARCH_SEGMENTS`
 *
 * For **subpath** deployments, keep using `document.querySelector('base')` + `API_V1_PATH` + segments
 * (see `saasApi`); do not assume `/api/v1` is always at the domain root.
 */

// ─── FYERS api-t2 (absolute) ─────────────────────────────────────────────────

export const FYERS_T2_API_BASE = 'https://api-t2.fyers.in' as const;

export function getFyersT2ApiBaseNormalized(): string {
  return FYERS_T2_API_BASE.replace(/\/$/, '');
}

/**
 * Path segments after `/insti/admin/org/{orgId}/research/` for insti-conflux-users FYERS org research.
 * @see `fyersOrgResearchUrl`
 */
export const FYERS_ORG_RESEARCH_SEGMENTS = {
  documentUpload: 'document-upload',
  saveReportUpload: 'save-report-upload',
  documents: 'documents',
  /** Binary file bytes — `GET .../documents/{documentId}/download` */
  download: 'download',
  folders: 'folders',
  templates: 'templates',
  personas: 'personas',
  multipart: 'multipart',
  parts: 'parts',
  complete: 'complete',
} as const;

/** Full URL: `{base}/insti/admin/org/{orgId}/research/{...segments}`. */
export function fyersOrgResearchUrl(
  orgId: number | string,
  ...pathSegments: string[]
): string {
  const base = getFyersT2ApiBaseNormalized();
  const tail = pathSegments
    .filter(Boolean)
    .map((s) => (s.startsWith('/') ? s.slice(1) : s))
    .join('/');
  return `${base}/insti/admin/org/${orgId}/research/${tail}`;
}

/** Concrete FYERS URLs (append-only). Org-research rows use `{orgId}` as a documentation placeholder. */
export const fyersT2Urls = {
  instiAdminUserDetails: `${FYERS_T2_API_BASE}/insti/admin/user-details`,
  instiOrgResearchDocumentUpload: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/document-upload`,
  instiOrgResearchSaveReportUpload: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/save-report-upload`,
  instiOrgResearchDocuments: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents`,
  instiOrgResearchDocumentsById: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}`,
  instiOrgResearchDocumentDownload: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}/download`,
  instiOrgResearchFolders: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/folders`,
  instiOrgResearchTemplates: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/templates`,
  instiOrgResearchPersonas: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/personas`,
  instiOrgResearchMultipartPart: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}/multipart/parts/{partNumber}`,
  instiOrgResearchComplete: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}/complete`,
} as const;

export type FyersT2UrlKey = keyof typeof fyersT2Urls;

/** Machine-readable FYERS api-t2 list for tooling or diagnostics. */
export const fyersT2ApiList: ReadonlyArray<{
  key: FyersT2UrlKey;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  usedIn: string;
}> = [
  {
    key: 'instiAdminUserDetails',
    method: 'GET',
    url: fyersT2Urls.instiAdminUserDetails,
    usedIn: 'services/proxy/proxymain.go — fetchUserDetailsFromFyersAPI',
  },
  {
    key: 'instiOrgResearchDocumentUpload',
    method: 'POST',
    url: fyersT2Urls.instiOrgResearchDocumentUpload,
    usedIn: 'researchConfluxApi.documentUpload',
  },
  {
    key: 'instiOrgResearchSaveReportUpload',
    method: 'POST',
    url: fyersT2Urls.instiOrgResearchSaveReportUpload,
    usedIn: 'researchConfluxApi.saveReportUpload',
  },
  {
    key: 'instiOrgResearchDocuments',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchDocuments,
    usedIn: 'researchConfluxApi.listDocuments; POST beginMultipart',
  },
  {
    key: 'instiOrgResearchDocumentsById',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchDocumentsById,
    usedIn: 'researchConfluxApi.getDocument, deleteDocument',
  },
  {
    key: 'instiOrgResearchDocumentDownload',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchDocumentDownload,
    usedIn: 'researchConfluxApi.downloadDocument; saasApi.downloadFile',
  },
  {
    key: 'instiOrgResearchFolders',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchFolders,
    usedIn: 'researchConfluxApi.listFolders, createFolder',
  },
  {
    key: 'instiOrgResearchTemplates',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchTemplates,
    usedIn: 'researchConfluxApi.listTemplates, createTemplate',
  },
  {
    key: 'instiOrgResearchPersonas',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchPersonas,
    usedIn: 'researchConfluxApi.listPersonas, createPersona, updatePersona, deletePersona',
  },
  {
    key: 'instiOrgResearchMultipartPart',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchMultipartPart,
    usedIn: 'researchConfluxApi.presignMultipartPart',
  },
  {
    key: 'instiOrgResearchComplete',
    method: 'POST',
    url: fyersT2Urls.instiOrgResearchComplete,
    usedIn: 'researchConfluxApi.completeMultipart',
  },
];

// ─── Same-origin Insti proxy (/api/v1) ─────────────────────────────────────

/** Path segment after site base href (see `saasApi` `getBaseHref()`). */
export const API_V1_PATH = 'api/v1' as const;

/**
 * Join base href (no trailing slash) with `/api/v1/...` segments.
 * @example instiApiV1Url('/app', 'auth', 'me') → `/app/api/v1/auth/me`
 */
export function instiApiV1Url(baseHref: string, ...pathSegments: string[]): string {
  const base = baseHref.replace(/\/$/, '');
  const rest = pathSegments
    .filter((s) => s !== '')
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .join('/');
  return rest ? `${base}/${API_V1_PATH}/${rest}` : `${base}/${API_V1_PATH}`;
}

/**
 * Path segments under `/api/v1/` (no leading slash). Compose with `instiApiV1Url(getBaseHref(), …)`
 * or `${getBaseHref()}/${API_V1_PATH}/${segment}`.
 */
export const apiV1Segments = {
  authRefresh: 'auth/refresh',
  authMe: 'auth/me',
  authLogout: 'auth/logout',
  authSendOtp: 'auth/send-otp',
  authVerifyOtp: 'auth/verify-otp',
  authResendOtp: 'auth/resend-otp',
  organizations: 'organizations',
  users: 'users',
  roles: 'roles',
  permissions: 'permissions',
  templates: 'templates',
  personas: 'personas',
  folders: 'folders',
  foldersTree: 'folders/tree',
  documents: 'documents',
  documentsUpload: 'documents/upload',
  documentsSaveReport: 'documents/save-report',
  screenersSaved: 'screeners/saved',
  screenersSave: 'screeners/save',
} as const;

export function apiV1OrganizationPath(id: string | number): string {
  return `${apiV1Segments.organizations}/${id}`;
}

export function apiV1UserPath(id: string | number): string {
  return `${apiV1Segments.users}/${id}`;
}

export function apiV1UserPermissionsPath(id: string | number): string {
  return `${apiV1Segments.users}/${id}/permissions`;
}

export function apiV1UserRolesPath(userId: string | number): string {
  return `${apiV1Segments.users}/${userId}/roles`;
}

export function apiV1UserRolePath(userId: string | number, roleId: string | number): string {
  return `${apiV1Segments.users}/${userId}/roles/${roleId}`;
}

export function apiV1RolePath(id: string | number): string {
  return `${apiV1Segments.roles}/${id}`;
}

export function apiV1RolePermissionsPath(id: string | number): string {
  return `${apiV1Segments.roles}/${id}/permissions`;
}

export function apiV1RolePermissionGrantPath(roleId: string | number): string {
  return `${apiV1Segments.roles}/${roleId}/permissions`;
}

export function apiV1TemplatePath(id: string | number): string {
  return `${apiV1Segments.templates}/${id}`;
}

export function apiV1PersonaPath(id: string | number): string {
  return `${apiV1Segments.personas}/${id}`;
}

export function apiV1FolderPath(id: string | number): string {
  return `${apiV1Segments.folders}/${id}`;
}

export function apiV1FolderPermissionsPath(id: string | number): string {
  return `${apiV1Segments.folders}/${id}/permissions`;
}

export function apiV1FolderPermissionPath(folderId: string | number, roleId: string | number): string {
  return `${apiV1Segments.folders}/${folderId}/permissions/${roleId}`;
}

export function apiV1DocumentPath(id: string | number): string {
  return `${apiV1Segments.documents}/${id}`;
}

export function apiV1DocumentDownloadPath(id: string | number): string {
  return `${apiV1Segments.documents}/${id}/download`;
}

export function apiV1ScreenerPath(id: string | number): string {
  return `screeners/${id}`;
}

export function apiV1ScreenerRunPath(id: string | number): string {
  return `screeners/${id}/run`;
}

/** Same-origin Insti/inquora routes (when app served at `/`; prepend base href for subpaths). */
export const apiV1Catalog = {
  authRefresh: { method: 'POST' as const, path: '/api/v1/auth/refresh', usedIn: 'saasApi.refreshToken' },
  authMe: { method: 'GET' as const, path: '/api/v1/auth/me', usedIn: 'saasApi.getCurrentUser' },
  authLogout: { method: 'POST' as const, path: '/api/v1/auth/logout', usedIn: 'TopNavBar' },
  authSendOtp: { method: 'POST' as const, path: '/api/v1/auth/send-otp', usedIn: 'Login.tsx' },
  authVerifyOtp: { method: 'POST' as const, path: '/api/v1/auth/verify-otp', usedIn: 'OTP.tsx' },
  authResendOtp: { method: 'POST' as const, path: '/api/v1/auth/resend-otp', usedIn: 'OTP.tsx' },
  organizationsList: { method: 'GET' as const, path: '/api/v1/organizations?limit=1000', usedIn: 'saasApi.getOrganizations' },
  organizationsCreate: { method: 'POST' as const, path: '/api/v1/organizations', usedIn: 'saasApi.createOrganization' },
  organizationById: { method: 'GET' as const, path: '/api/v1/organizations/{id}', usedIn: 'saasApi.getOrganization' },
  organizationUpdate: { method: 'PUT' as const, path: '/api/v1/organizations/{id}', usedIn: 'saasApi.updateOrganization' },
  usersList: { method: 'GET' as const, path: '/api/v1/users?limit=1000', usedIn: 'saasApi.getUsers' },
  usersCreate: { method: 'POST' as const, path: '/api/v1/users', usedIn: 'saasApi.createUser' },
  userById: { method: 'GET' as const, path: '/api/v1/users/{id}', usedIn: 'saasApi.getUser' },
  userUpdate: { method: 'PUT' as const, path: '/api/v1/users/{id}', usedIn: 'saasApi.updateUser' },
  userDelete: { method: 'DELETE' as const, path: '/api/v1/users/{id}', usedIn: 'saasApi.deleteUser' },
  userPermissions: { method: 'GET' as const, path: '/api/v1/users/{id}/permissions', usedIn: 'saasApi.getUserPermissions' },
  userRolesAssign: { method: 'POST' as const, path: '/api/v1/users/{userId}/roles', usedIn: 'saasApi.assignUserRole' },
  userRoleRemove: { method: 'DELETE' as const, path: '/api/v1/users/{userId}/roles/{roleId}', usedIn: 'saasApi.removeUserRole' },
  rolesList: { method: 'GET' as const, path: '/api/v1/roles', usedIn: 'saasApi.getRoles' },
  rolesCreate: { method: 'POST' as const, path: '/api/v1/roles', usedIn: 'saasApi.createRole' },
  roleById: { method: 'GET' as const, path: '/api/v1/roles/{id}', usedIn: 'saasApi.getRole' },
  roleUpdate: { method: 'PUT' as const, path: '/api/v1/roles/{id}', usedIn: 'saasApi.updateRole' },
  roleDelete: { method: 'DELETE' as const, path: '/api/v1/roles/{id}', usedIn: 'saasApi.deleteRole' },
  rolePermissions: { method: 'GET' as const, path: '/api/v1/roles/{id}/permissions', usedIn: 'saasApi.getRolePermissions' },
  rolePermissionAssign: { method: 'POST' as const, path: '/api/v1/roles/{roleId}/permissions', usedIn: 'saasApi.assignRolePermission' },
  permissionsList: { method: 'GET' as const, path: '/api/v1/permissions', usedIn: 'saasApi.getPermissions' },
  templatesList: { method: 'GET' as const, path: '/api/v1/templates?limit=1000', usedIn: 'saasApi.getTemplates' },
  templatesCreate: { method: 'POST' as const, path: '/api/v1/templates', usedIn: 'saasApi.createTemplate' },
  templateById: { method: 'GET' as const, path: '/api/v1/templates/{id}', usedIn: 'saasApi.getTemplate' },
  templateUpdate: { method: 'PUT' as const, path: '/api/v1/templates/{id}', usedIn: 'saasApi.updateTemplate' },
  personasList: {
    method: 'GET' as const,
    path: '{FYERS}/insti/admin/org/{orgId}/research/personas',
    usedIn: 'researchConfluxApi.listPersonas; saasApi.getPersonas',
  },
  personasCreate: {
    method: 'POST' as const,
    path: '{FYERS}/insti/admin/org/{orgId}/research/personas',
    usedIn: 'saasApi.createPersona',
  },
  personaById: {
    method: 'GET' as const,
    path: '{FYERS}/insti/admin/org/{orgId}/research/personas/{id}',
    usedIn: 'researchConfluxApi.getPersona',
  },
  personaUpdate: {
    method: 'PUT' as const,
    path: '{FYERS}/insti/admin/org/{orgId}/research/personas/{id}',
    usedIn: 'saasApi.updatePersona',
  },
  personaDelete: {
    method: 'DELETE' as const,
    path: '{FYERS}/insti/admin/org/{orgId}/research/personas/{id}',
    usedIn: 'saasApi.deletePersona',
  },
  foldersList: { method: 'GET' as const, path: '/api/v1/folders', usedIn: 'saasApi.getFolders' },
  foldersTree: { method: 'GET' as const, path: '/api/v1/folders/tree', usedIn: 'saasApi.getFolderTree' },
  foldersCreate: { method: 'POST' as const, path: '/api/v1/folders', usedIn: 'saasApi.createFolder (inquora path)' },
  folderById: { method: 'GET' as const, path: '/api/v1/folders/{id}', usedIn: 'saasApi.getFolder' },
  folderUpdate: { method: 'PUT' as const, path: '/api/v1/folders/{id}', usedIn: 'saasApi.updateFolder' },
  folderDelete: { method: 'DELETE' as const, path: '/api/v1/folders/{id}', usedIn: 'saasApi.deleteFolder' },
  folderPermissions: { method: 'GET' as const, path: '/api/v1/folders/{id}/permissions', usedIn: 'saasApi.getFolderPermissions' },
  folderPermissionAssign: { method: 'POST' as const, path: '/api/v1/folders/{folderId}/permissions', usedIn: 'saasApi.assignFolderPermission' },
  folderPermissionRemove: { method: 'DELETE' as const, path: '/api/v1/folders/{folderId}/permissions/{roleId}', usedIn: 'saasApi.removeFolderPermission' },
  documentsList: { method: 'GET' as const, path: '/api/v1/documents', usedIn: 'saasApi.getFiles' },
  documentById: { method: 'GET' as const, path: '/api/v1/documents/{id}', usedIn: 'saasApi.getFile, updateFile' },
  documentDownload: {
    method: 'GET' as const,
    path: '/api/v1/documents/{id}/download',
    usedIn: 'legacy insti-inquora; research bytes use fyersT2Urls.instiOrgResearchDocumentDownload / researchConfluxApi.downloadDocument',
  },
  documentDelete: { method: 'DELETE' as const, path: '/api/v1/documents/{id}', usedIn: 'saasApi.deleteFile' },
  documentsUpload: { method: 'POST' as const, path: '/api/v1/documents/upload', usedIn: 'saasApi.uploadFile, createFile' },
  documentsSaveReport: { method: 'POST' as const, path: '/api/v1/documents/save-report', usedIn: 'saasApi.saveReport' },
  screenersSaved: { method: 'GET' as const, path: '/api/v1/screeners/saved', usedIn: 'ScreenerRoute.tsx' },
  screenersSave: { method: 'POST' as const, path: '/api/v1/screeners/save', usedIn: 'ScreenerRoute.tsx' },
  screenerDelete: { method: 'DELETE' as const, path: '/api/v1/screeners/{id}', usedIn: 'ScreenerRoute.tsx' },
  screenerRun: { method: 'POST' as const, path: '/api/v1/screeners/{id}/run', usedIn: 'ScreenerRoute.tsx' },
} as const;

export type ApiV1CatalogKey = keyof typeof apiV1Catalog;
