import { Router, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { withConnection } from '../utils/db';
import { getTenantId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/formatters';

const router = Router();

interface TemplatePartRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string | null;
  content_template: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

function isValidCode(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 &&
    value !== '.' && value !== '..' && /^[^\s{}\/?]+$/.test(value);
}

function isValidName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255;
}

function isDuplicateEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ER_DUP_ENTRY';
}

function respondError(res: Response, err: unknown): Response {
  return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await withConnection(async (conn) => {
      const [result] = await conn.query(
        'SELECT id, code, name, is_active FROM email_template_part WHERE tenant_id = ? ORDER BY name',
        [tenantId],
      );
      return result as TemplatePartRow[];
    });
    return res.json(successResponse({
      parts: rows.map(row => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active === 1 })),
    }));
  } catch (err) {
    return respondError(res, err);
  }
});

router.get('/:code', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const code = req.params.code;
    const rows = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `SELECT id, code, name, description, content_template, is_active, created_at, updated_at
         FROM email_template_part WHERE tenant_id = ? AND code = ? LIMIT 1`,
        [tenantId, code],
      );
      return result as TemplatePartRow[];
    });
    if (rows.length === 0) return res.status(404).json(errorResponse(`Template part '${code}' not found`));
    const row = rows[0];
    return res.json(successResponse({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      contentTemplate: row.content_template,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    return respondError(res, err);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { code, name, description, contentTemplate } = req.body ?? {};
    if (!isValidCode(code)) {
      return res.status(400).json(errorResponse('code must be 1-100 characters without whitespace, braces, / or ?, and cannot be . or ..'));
    }
    if (!isValidName(name) || typeof contentTemplate !== 'string' ||
        (description !== undefined && description !== null && typeof description !== 'string')) {
      return res.status(400).json(errorResponse('name and contentTemplate are required strings; description must be a string or null'));
    }
    const tenantId = getTenantId(req);
    const insertId = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO email_template_part (tenant_id, code, name, description, content_template)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, code, name, description ?? null, contentTemplate],
      );
      return (result as ResultSetHeader).insertId;
    });
    return res.status(201).json(successResponse({ id: insertId, code }));
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return res.status(409).json(errorResponse('A template part with this code already exists for this tenant'));
    }
    return respondError(res, err);
  }
});

router.put('/:code', async (req: Request, res: Response) => {
  try {
    const { name, description, contentTemplate, isActive } = req.body ?? {};
    if ((name !== undefined && !isValidName(name)) ||
        (description !== undefined && description !== null && typeof description !== 'string') ||
        (contentTemplate !== undefined && typeof contentTemplate !== 'string') ||
        (isActive !== undefined && typeof isActive !== 'boolean')) {
      return res.status(400).json(errorResponse('Invalid template part fields'));
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (contentTemplate !== undefined) { fields.push('content_template = ?'); values.push(contentTemplate); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json(errorResponse('No fields provided to update'));

    const code = req.params.code;
    values.push(getTenantId(req), code);
    const affected = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `UPDATE email_template_part SET ${fields.join(', ')} WHERE tenant_id = ? AND code = ?`,
        values,
      );
      return (result as ResultSetHeader).affectedRows;
    });
    if (affected === 0) return res.status(404).json(errorResponse(`Template part '${code}' not found`));
    return res.json(successResponse({ success: true }));
  } catch (err) {
    return respondError(res, err);
  }
});

router.delete('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const affected = await withConnection(async (conn) => {
      const [result] = await conn.query(
        'UPDATE email_template_part SET is_active = 0 WHERE tenant_id = ? AND code = ?',
        [getTenantId(req), code],
      );
      return (result as ResultSetHeader).affectedRows;
    });
    if (affected === 0) return res.status(404).json(errorResponse(`Template part '${code}' not found`));
    return res.json(successResponse({ success: true }));
  } catch (err) {
    return respondError(res, err);
  }
});

export default router;
