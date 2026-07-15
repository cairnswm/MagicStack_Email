import { Router, Request, Response } from 'express';
import { withConnection } from '../utils/db';
import { getTenantId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/formatters';
import { renderTemplate, RenderTemplateOptions, TemplateObject } from '../services/templateRenderer';

const router = Router();

type TemplateRenderRequest = {
  id?: number;
  slug?: string;
  template?: string;
  data?: TemplateObject;
  options?: RenderTemplateOptions;
};

async function renderTemplatePreview(req: Request, res: Response, body: TemplateRenderRequest): Promise<Response> {
  const tenantId = getTenantId(req);
  const id = body.id;
  const slug = body.slug;
  const inlineTemplate = body.template;
  const renderData = body.data;

  if (!renderData || typeof renderData !== 'object' || Array.isArray(renderData)) {
    return res.status(400).json(errorResponse('data is required and must be an object'));
  }

  if (id === undefined && !slug && !inlineTemplate) {
    return res.status(400).json(errorResponse('Provide id, slug, or template'));
  }

  if (id !== undefined || slug) {
    const rows = await withConnection(async (conn) => {
      if (id !== undefined) {
        const [result] = await conn.query(
          `SELECT id, code, subject_template, html_template
           FROM email_template WHERE tenant_id = ? AND id = ? LIMIT 1`,
          [tenantId, id],
        );
        return result as any[];
      }

      const [result] = await conn.query(
        `SELECT id, code, subject_template, html_template
         FROM email_template WHERE tenant_id = ? AND code = ? LIMIT 1`,
        [tenantId, slug],
      );
      return result as any[];
    });

    if (rows.length === 0) {
      return res.status(404).json(errorResponse('Template not found'));
    }

    const template = rows[0];
    const renderedSubject = renderTemplate(template.subject_template as string, renderData, body.options);
    const renderedHtml = renderTemplate(template.html_template as string, renderData, {
      ...(body.options || {}),
      escapeHtml: body.options?.escapeHtml ?? true,
    });

    return res.json(successResponse({
      source: 'stored',
      templateId: template.id as number,
      templateCode: template.code as string,
      rendered: renderedHtml,
      renderedSubject,
      renderedHtml,
    }));
  }

  const rendered = renderTemplate(inlineTemplate as string, renderData, body.options);
  return res.json(successResponse({
    source: 'inline',
    rendered,
  }));
}

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

// POST /template/render - render template from id/slug or inline template text
router.post('/render', async (req: Request, res: Response) => {
  try {
    const body = req.body as TemplateRenderRequest;
    return renderTemplatePreview(req, res, body);
  } catch (err) {
    return res.status(400).json(errorResponse(err instanceof Error ? err.message : 'Template rendering failed'));
  }
});

// POST /template - create a new template
router.post('/', async (req: Request, res: Response) => {
  try {
    const maybeRender = req.body as TemplateRenderRequest;
    const isRenderRequest = maybeRender && typeof maybeRender === 'object' && (
      maybeRender.id !== undefined ||
      !!maybeRender.slug ||
      !!maybeRender.template
    );

    if (isRenderRequest) {
      return renderTemplatePreview(req, res, maybeRender);
    }

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
