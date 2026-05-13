/**
 * FYERS org research API — Owner column and system-row detection (v1.1+).
 * Supports camelCase API payloads and snake_case from processors / mapped client nodes.
 */

function asRow(row: object): Record<string, unknown> {
  return row as Record<string, unknown>;
}

/**
 * Accepts raw API objects or mapped folder/file/template/persona nodes.
 * Tenant-owned rows carry a non-empty org id; built-in catalog rows omit org or send null/empty.
 * (Older logic treated omitted org as non-system, which showed Edit/Delete on FYERS system templates.)
 */
export function isResearchSystemRow(row: object): boolean {
  const r = asRow(row);
  if (r.isSystem === true || r.is_system === true) {
    return true;
  }
  if (r.isSystem === false || r.is_system === false) {
    return false;
  }
  const orgRaw = r.orgId ?? r.org_id;
  if (orgRaw !== null && orgRaw !== undefined && String(orgRaw).trim() !== '') {
    return false;
  }
  return true;
}

/** Resolve stable id for templates (list/update/delete URLs). API may use id, _id, or template_id. */
export function researchTemplateId(row: object): string | undefined {
  const r = asRow(row);
  const v = r.id ?? r.templateId ?? r.template_id ?? r._id;
  if (v == null || v === '') {
    return undefined;
  }
  return String(v);
}

/** Resolve stable id for personas/agents. API may use id, _id, or persona_id. */
export function researchPersonaId(row: object): string | undefined {
  const r = asRow(row);
  const v = r.id ?? r.personaId ?? r.persona_id ?? r._id;
  if (v == null || v === '') {
    return undefined;
  }
  return String(v);
}

export function researchOwnerColumnLabel(row: object): string {
  const r = asRow(row);
  if (isResearchSystemRow(row)) {
    return 'Fyers';
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
