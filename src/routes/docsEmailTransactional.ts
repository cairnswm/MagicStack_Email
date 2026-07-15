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
      <h1>Email Sending</h1>
      <p>Send emails directly or using stored templates. Responses include status (queued/processing/sent/failed).</p>
    </header>
    <nav class="site-nav" style="margin-bottom:0;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;">
      <a href="${withBasePath('/docs/config')}">Configuration</a>
      <a href="${withBasePath('/docs/send')}" style="font-weight:600;color:#2d7a2d;">Send Email</a>
      <a href="${withBasePath('/docs/templates')}">Templates</a>
      <a href="${withBasePath('/docs/logs')}">Logs</a>
      <a href="${withBasePath('/docs/template-help')}">Template Help</a>
    </nav>
    <nav class="site-nav" style="margin-top:0.75rem;font-size:0.875rem;">
      <span style="color:#666;font-weight:500;">On this page:</span>
      <a href="#post-send">POST /send</a>
      <a href="#post-send-template">POST /send/:templateCode</a>
      <a href="#post-render">POST /template/render</a>
    </nav>

    <main class="content-shell">

      ${apiCard('post-send', 'POST', '/send', 'Send an email',
        'Sends an email directly without a stored template. Resolves synchronously or queues the email depending on tenant delivery mode. Requires the tenant API key to have the <code>sendByEmail</code> property set to <code>true</code> or <code>1</code>; returns 403 otherwise.',
        `type SendEmailRequest = {
  subject: string;
  htmlBody: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
  images?: EmailImage[];
};`,
        `type SendEmailResponse = {
  emailId: number;
  emailCode: string;
  status: EmailStatus;
  provider: string;
};`)}

      ${apiCard('post-send-template', 'POST', '/send/:templateCode', 'Send a templated email',
        'Loads and renders a stored template with supplied parameters, then sends. Rendered content is stored in audit so future template edits don\'t affect sent records.',
        `type SendTemplateEmailRequest = {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
  images?: EmailImage[];
  parameters: Record<string, unknown>;
};`,
        `type SendTemplateEmailResponse = {
  emailId: number;
  emailCode: string;
  templateCode: string;
  status: EmailStatus;
  provider: string;
};`)}

      ${apiCard('post-render', 'POST', '/template/render', 'Render template preview',
        'Renders a template without sending. Use <code>id</code> or <code>slug</code> for stored templates, or <code>template</code> for inline text. Useful for validating output before sending.',
        `type RenderTemplateRequest = {
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
        `type RenderTemplateResponse = {
  source: 'stored' | 'inline';
  templateId?: number;
  templateCode?: string;
  rendered: string;
  renderedSubject?: string;
  renderedHtml?: string;
};`)}

    </main>`;

  res.type('html').send(renderPage('Email Sending | Email API', body, logoUrl));
});

export default router;
