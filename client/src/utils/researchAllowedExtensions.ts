/**
 * Mirrors backend `RESEARCH_ALLOWED_EXTENSIONS` (comma-separated env).
 * Keep in sync when the server allowlist changes.
 */
export const RESEARCH_ALLOWED_EXTENSIONS = [
  'docx',
  'dotx',
  'docm',
  'dotm',
  'pptx',
  'pdf',
  'md',
  'html',
  'htm',
  'xhtml',
  'jpg',
  'jpeg',
  'png',
  'tiff',
  'bmp',
  'webp',
  'csv',
  'xlsx',
  'xlsm',
  'txt',
  'json',
] as const;

const ALLOWED_SET = new Set<string>(RESEARCH_ALLOWED_EXTENSIONS);

/** Value for `<input type="file" accept="..." />`. */
export const RESEARCH_ALLOWED_ACCEPT = RESEARCH_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',');

export function researchUploadFileExtensionLower(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0 || i === fileName.length - 1) {
    return '';
  }
  return fileName.slice(i + 1).toLowerCase();
}

export function isResearchAllowedUploadFile(file: Pick<File, 'name'>): boolean {
  const ext = researchUploadFileExtensionLower(file.name);
  return ext !== '' && ALLOWED_SET.has(ext);
}
