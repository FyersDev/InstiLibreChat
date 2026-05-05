/**
 * FYERS org research API — Owner column and system-row detection (v1.1+).
 * Supports camelCase API payloads and snake_case from processors / mapped client nodes.
 */

function asRow(row: object): Record<string, unknown> {
  return row as Record<string, unknown>;
}

/** Accepts raw API objects or mapped folder/file/template/persona nodes. */
export function isResearchSystemRow(row: object): boolean {
  const r = asRow(row);
  if (r.isSystem === true || r.is_system === true) {
    return true;
  }
  if (!('orgId' in r) && !('org_id' in r)) {
    return false;
  }
  const org = r.orgId ?? r.org_id;
  return org === null || org === '';
}

export function researchOwnerColumnLabel(row: object): string {
  const r = asRow(row);
  if (isResearchSystemRow(row)) {
    return 'SYSTEM';
  }
  const name = r.createdByName ?? r.created_by_name;
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  const email = r.createdByEmail ?? r.created_by_email;
  if (typeof email === 'string' && email.trim()) {
    return email.trim();
  }
  return 'Unknown';
}
