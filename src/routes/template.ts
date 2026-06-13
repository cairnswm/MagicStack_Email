import { Router, Request, Response } from 'express';
import { withConnection } from '../utils/db';
import { getTenantId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/formatters';

const router = Router();

// GET /template - list all templates for the tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `SELECT id, code, name, is_active FROM email_template WHERE tenant_id = ? ORDER BY name`,
        [tenantId],
      );
      return result as any[];
    });
    return res.json(successResponse({
      templates: rows.map(r => ({
        id: r.id as number,
        code: r.code as string,
        name: r.name as string,
        isActive: r.is_active === 1,
      })),
    }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

// GET /template/:code - get a single template by code
router.get('/:code', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const code = req.params.code;
    const rows = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `SELECT id, code, name, description, subject_template, html_template, is_active, created_at, updated_at
         FROM email_template WHERE tenant_id = ? AND code = ? LIMIT 1`,
        [tenantId, code],
      );
      return result as any[];
    });
    if (rows.length === 0) {
      return res.status(404).json(errorResponse(`Template '${code}' not found`));
    }
    const r = rows[0];
    return res.json(successResponse({
      id: r.id as number,
      code: r.code as string,
      name: r.name as string,
      description: r.description as string | undefined,
      subjectTemplate: r.subject_template as string,
      htmlTemplate: r.html_template as string,
      isActive: r.is_active === 1,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

// POST /template - create a new template
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { code, name, description, subjectTemplate, htmlTemplate } = req.body as {
      code?: string;
      name?: string;
      description?: string;
      subjectTemplate?: string;
      htmlTemplate?: string;
    };

    if (!code || !name || !subjectTemplate || !htmlTemplate) {
      return res.status(400).json(errorResponse('code, name, subjectTemplate, and htmlTemplate are required'));
    }

    const insertId = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO email_template (tenant_id, code, name, description, subject_template, html_template)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, code, name, description || null, subjectTemplate, htmlTemplate],
      );
      return (result as any).insertId as number;
    });

    return res.status(201).json(successResponse({ id: insertId, code }));
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json(errorResponse('A template with this code already exists for this tenant'));
    }
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

// PUT /template/:code - update an existing template
router.put('/:code', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const code = req.params.code;
    const { name, description, subjectTemplate, htmlTemplate, isActive } = req.body as {
      name?: string;
      description?: string;
      subjectTemplate?: string;
      htmlTemplate?: string;
      isActive?: boolean;
    };

    const fields: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (subjectTemplate !== undefined) { fields.push('subject_template = ?'); values.push(subjectTemplate); }
    if (htmlTemplate !== undefined) { fields.push('html_template = ?'); values.push(htmlTemplate); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json(errorResponse('No fields provided to update'));
    }

    values.push(tenantId, code);
    const affected = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `UPDATE email_template SET ${fields.join(', ')} WHERE tenant_id = ? AND code = ?`,
        values,
      );
      return (result as any).affectedRows as number;
    });

    if (affected === 0) {
      return res.status(404).json(errorResponse(`Template '${code}' not found`));
    }
    return res.json(successResponse({ success: true }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

// DELETE /template/:code - soft delete (mark inactive)
router.delete('/:code', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const code = req.params.code;
    const affected = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `UPDATE email_template SET is_active = 0 WHERE tenant_id = ? AND code = ?`,
        [tenantId, code],
      );
      return (result as any).affectedRows as number;
    });
    if (affected === 0) {
      return res.status(404).json(errorResponse(`Template '${code}' not found`));
    }
    return res.json(successResponse({ success: true }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

export default router;
