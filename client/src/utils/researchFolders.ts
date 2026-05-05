/**
 * FYERS org research — folder roles from Conflux API (`folder_kind` / aliases).
 * Avoid matching display `name`; use API-provided markers only.
 *
 * Contract: each folder row should include `folder_kind` (or an alias mapped in
 * `researchFolderKind`) — e.g. `reports` for the reports tab root and `default_upload`
 * for the org default document folder. Until the API sends these, the Reports tab and
 * report-vs-document separation may be empty or incomplete on the client.
 */

import { isResearchSystemRow } from './researchOwner';

/** Values the Conflux API may send for `folder_kind` (or camelCase `folderKind`). */
export const RESEARCH_FOLDER_KIND = {
  reports: 'reports',
  defaultUpload: 'default_upload',
} as const;

export function researchFolderKind(row: object): string | undefined {
  const r = row as Record<string, unknown>;
  const v =
    r.folder_kind ??
    r.folderKind ??
    r.kind ??
    r.category ??
    r.purpose ??
    r.folderType ??
    r.folder_type;
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined;
}

export function isResearchReportsFolder(row: object): boolean {
  return researchFolderKind(row) === RESEARCH_FOLDER_KIND.reports;
}

export function isResearchDefaultUploadFolder(row: object): boolean {
  return researchFolderKind(row) === RESEARCH_FOLDER_KIND.defaultUpload;
}

export function researchRenameLocked(row: object): boolean {
  const r = row as Record<string, unknown>;
  return r.rename_locked === true || r.renameLocked === true;
}

export function researchFolderPathFromRoot<T extends { id: string; children?: T[] }>(
  roots: T[],
  folderId: string,
): T[] {
  const dfs = (nodes: T[], path: T[]): T[] | null => {
    for (const n of nodes) {
      const next = [...path, n];
      if (String(n.id) === String(folderId)) {
        return next;
      }
      if (n.children?.length) {
        const found = dfs(n.children as T[], next);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  return dfs(roots, []) ?? [];
}

/** True if `folderId` is under a system-managed folder (path includes a system row). */
export function isResearchFolderUnderSystemSubtree(folderId: string | undefined, roots: object[]): boolean {
  if (!folderId || !roots.length) {
    return false;
  }
  const path = researchFolderPathFromRoot(roots as { id: string; children?: unknown[] }[], folderId);
  return path.some((n) => isResearchSystemRow(n));
}

export function findResearchReportsFolderInTree<T extends { id: string; children?: T[] }>(
  folders: T[],
): T | null {
  for (const f of folders) {
    if (isResearchReportsFolder(f)) {
      return f;
    }
    if (f.children?.length) {
      const found = findResearchReportsFolderInTree(f.children as T[]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
