export type TemplatePartMap = Record<string, string>;

export async function loadActiveTemplateParts(conn: any, tenantId: string): Promise<TemplatePartMap> {
  const [result] = await conn.query(
    `SELECT code, content_template FROM email_template_part WHERE tenant_id = ? AND is_active = 1`,
    [tenantId],
  );

  const rows = result as any[];
  const parts: TemplatePartMap = Object.create(null);

  for (const row of rows) {
    parts[String(row.code)] = String(row.content_template ?? '');
  }

  return parts;
}