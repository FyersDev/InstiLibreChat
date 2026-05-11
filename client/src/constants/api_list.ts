/**
 * API registry for this client: FYERS **api-t2** (absolute URLs) used by org research and user-details.
 *
 * Used in-repo:
 * - `client/src/main.jsx` — `globalThis.__FYERS_T2_API__` (base, urls, list)
 * - `services/proxy/proxymain.go` — GET user-details (`FYERS_T2_INSTI_ADMIN_USER_DETAILS` overrides URL;
 *   default string should match `fyersT2Urls.instiAdminUserDetails`)
 * - `client/src/services/saasApi.ts` — wraps FYERS Conflux + user-details
 * - `client/src/services/researchConfluxApi.ts` — `fyersOrgResearchUrl` + `FYERS_ORG_RESEARCH_SEGMENTS`
 *
 * Reports (FYERS org research): list `GET .../research/reports`; upload `POST .../save-report-upload`;
 * download presigned `GET .../documents/{documentId}/download`; soft delete `DELETE .../documents/{documentId}` (204);
 * retry processor notify `POST .../documents/{documentId}/doc-processor-notify` (no body).
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
  /** Single-call folder tree + documents incl. `unfiledDocuments`. */
  hierarchy: 'hierarchy',
  /** Flat list of saved reports (PDFs); ensures Reports folder exists server-side. */
  reports: 'reports',
  documentUpload: 'document-upload',
  saveReportUpload: 'save-report-upload',
  documents: 'documents',
  /** `GET .../documents/{documentId}/download` returns JSON `data`: presigned S3 `PresignedHTTPRequest` */
  download: 'download',
  /** `POST .../documents/{documentId}/doc-processor-notify` — re-send async upload job to doc processor. */
  docProcessorNotify: 'doc-processor-notify',
  folders: 'folders',
  templates: 'templates',
  personas: 'personas',
  predefinedAgents: 'predefined-agents',
  predefinedFrameworks: 'predefined-frameworks',
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
  instiOrgResearchReports: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/reports`,
  instiOrgResearchDocuments: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents`,
  instiOrgResearchDocumentsById: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}`,
  instiOrgResearchDocumentDownload: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}/download`,
  instiOrgResearchDocProcessorNotify: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/documents/{documentId}/doc-processor-notify`,
  instiOrgResearchHierarchy: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/hierarchy`,
  instiOrgResearchFolders: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/folders`,
  instiOrgResearchTemplates: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/templates`,
  instiOrgResearchPersonas: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/personas`,
  instiOrgResearchPredefinedAgents: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/predefined-agents`,
  instiOrgResearchPredefinedFrameworks: `${FYERS_T2_API_BASE}/insti/admin/org/{orgId}/research/predefined-frameworks`,
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
    key: 'instiOrgResearchHierarchy',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchHierarchy,
    usedIn: 'researchConfluxApi.getResearchHierarchy; saasApi.getFolderTree',
  },
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
    key: 'instiOrgResearchReports',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchReports,
    usedIn: 'researchConfluxApi.listReports; saasApi.listResearchReports',
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
    usedIn:
      'JSON presigned request in data; researchConfluxApi.getDocumentDownloadPresigned, downloadDocument; saasApi',
  },
  {
    key: 'instiOrgResearchDocProcessorNotify',
    method: 'POST',
    url: fyersT2Urls.instiOrgResearchDocProcessorNotify,
    usedIn: 'researchConfluxApi.docProcessorNotify; saasApi.retryDocumentProcessor',
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
    key: 'instiOrgResearchPredefinedAgents',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchPredefinedAgents,
    usedIn: 'researchConfluxApi.listPredefinedAgents, getPredefinedAgent; saasApi.getPredefinedAgents',
  },
  {
    key: 'instiOrgResearchPredefinedFrameworks',
    method: 'GET',
    url: fyersT2Urls.instiOrgResearchPredefinedFrameworks,
    usedIn:
      'researchConfluxApi.listPredefinedFrameworks, getPredefinedFramework; saasApi.getPredefinedFrameworks',
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
