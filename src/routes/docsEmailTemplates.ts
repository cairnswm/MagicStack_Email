import { Router, Request, Response } from 'express';

const router = Router();
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const docsPath = `${basePath}/docs`;

function withBasePath(path: string) {
  return `${basePath}${path}` || path;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPage(title: string, body: string, faviconUrl = '') {
  const faviconTag = faviconUrl
    ? `<link rel="icon" type="image/svg+xml" href="${faviconUrl}" />`
    : '';
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${faviconTag}
    <link rel="stylesheet" href="https://cdn.runeworkz.com/styles.css" />
  </head><body class="app-shell">${body}</body></html>`;
}

function apiCard(id: string, method: string, path: string, title: string, desc: string, reqType: string, resType: string): string {
  return `
  <section id="${id}" class="doc-card">
    <div class="doc-card-header">
      <span class="http-method ${method}">${method}</span>
      <div>
        <div class="endpoint-path">${path}</div>
        <div class="doc-card-title">${title}</div>
      </div>
    </div>
    <div class="doc-card-body">
      <p class="doc-card-description">${desc}</p>
      <div class="cols">
        <section class="surface"><h3>Request</h3><pre class="code-block">${escHtml(reqType)}</pre></section>
        <section class="surface"><h3>Response</h3><pre class="code-block">${escHtml(resType)}</pre></section>
      </div>
    </div>
  </section>`;
}

router.get('/', (_req: Request, res: Response) => {
  const logoUrl = withBasePath('/email.svg');
  const body = `
    <header class="site-header">
      <span class="base-url">${docsPath}</span>
      <img src="${logoUrl}" alt="" style="width:2rem;height:2rem;vertical-align:middle;margin-right:0.5rem;" />
      <h1>Email Templates</h1>
      <p>Create, list, update, and manage email templates. Templates use the advanced template language with support for conditions, loops, and calculations.</p>
    </header>
    <nav class="site-nav" style="margin-bottom:0;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;">
      <a href="${withBasePath('/docs/send')}">Send Email</a>
      <a href="${withBasePath('/docs/templates')}" style="font-weight:600;color:#2d7a2d;">Templates</a>
      <a href="${withBasePath('/docs/logs')}">Logs</a>
      <a href="${withBasePath('/docs/template-help')}">Template Help</a>
    </nav>
    <nav class="site-nav" style="margin-top:0.75rem;font-size:0.875rem;">
      <span style="color:#666;font-weight:500;">On this page:</span>
      <a href="#get-list">GET /template</a>
      <a href="#get-one">GET /template/:code</a>
      <a href="#post-create">POST /template</a>
      <a href="#put-update">PUT /template/:code</a>
      <a href="#delete-deactivate">DELETE /template/:code</a>
    </nav>

    <main class="content-shell">

      ${apiCard('get-list', 'GET', '/template', 'List templates',
        'Returns all templates owned by the tenant. Templates are scoped by tenant and never visible across tenant boundaries.',
        `// No body — tenant scoped via X-Tenant-ID header`,
        `type GetTemplatesResponse = {
  templates: {
    id: number;
    code: string;
    name: string;
    isActive: boolean;
  }[];
};`)}

      ${apiCard('get-one', 'GET', '/template/:code', 'Get template',
        'Returns a single template by code, including its subject and HTML body templates.',
        `// code in path — no request body`,
        `type GetTemplateResponse = {
  id: number;
  code: string;
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};`)}

      ${apiCard('post-create', 'POST', '/template', 'Create template or render preview',
        'Creates a new template when creation fields are supplied. Also supports render-preview mode when request body includes <code>id</code>, <code>slug</code>, or <code>template</code>.',
        `type CreateTemplateRequest = {
  code: string;
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate: string;
};

type RenderViaTemplatePostRequest = {
  id?: number;
  slug?: string;
  template?: string;
  data: Record<string, unknown>;
  options?: {
    escapeHtml?: boolean;
    removeSpaceBeforePunctuation?: boolean;
    removeEmptyLines?: boolean;
    collapseWhitespace?: boolean;
  };
};`,
        `type CreateTemplateResponse = {
  id: number;
  code: string;
};

type RenderViaTemplatePostResponse = {
  source: 'stored' | 'inline';
  rendered: string;
  renderedSubject?: string;
  renderedHtml?: string;
};`)}

      ${apiCard('put-update', 'PUT', '/template/:code', 'Update template',
        'Updates one or more fields of an existing template. All fields are optional. Historical sent emails are unaffected by updates.',
        `type UpdateTemplateRequest = {
  name?: string;
  description?: string;
  subjectTemplate?: string;
  htmlTemplate?: string;
  isActive?: boolean;
};`,
        `type UpdateTemplateResponse = {
  success: boolean;
};`)}

      ${apiCard('delete-deactivate', 'DELETE', '/template/:code', 'Deactivate template',
        'Soft-deletes the template by marking it inactive. Existing email records are unchanged. Deactivated templates are excluded from future send operations.',
        `// code in path — no request body`,
        `type DeleteTemplateResponse = {
  success: boolean;
};`)}

    </main>`;

  res.type('html').send(renderPage('Templates | Email API', body, logoUrl));
});

export default router;
