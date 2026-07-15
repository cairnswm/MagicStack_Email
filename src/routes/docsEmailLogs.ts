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
      <h1>Email Logs &amp; Audit</h1>
      <p>Retrieve sent email records with full audit trail including recipients, delivery status, and event history.</p>
    </header>
    <nav class="site-nav" style="margin-bottom:0;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;">
      <a href="${withBasePath('/docs/send')}">Send Email</a>
      <a href="${withBasePath('/docs/templates')}">Templates</a>
      <a href="${withBasePath('/docs/logs')}" style="font-weight:600;color:#2d7a2d;">Logs</a>
      <a href="${withBasePath('/docs/template-help')}">Template Help</a>
    </nav>
    <nav class="site-nav" style="margin-top:0.75rem;font-size:0.875rem;">
      <span style="color:#666;font-weight:500;">On this page:</span>
      <a href="#get-list">GET /logs/:tenantId/email</a>
      <a href="#get-detail">GET /logs/:tenantId/email/:emailCode</a>
    </nav>

    <main class="content-shell">

      ${apiCard('get-list', 'GET', '/logs/:tenantId/email', 'List emails',
        'Returns a paginated list of emails sent by the tenant. Supports filtering by status, template code, and date range.',
        `// All fields are query parameters
type EmailLogQuery = {
  page?: number;
  pageSize?: number;
  status?: EmailStatus;
  templateCode?: string;
  fromDate?: string;  // ISO 8601
  toDate?: string;    // ISO 8601
};`,
        `type EmailLogResponse = {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: number;
    emailCode: string;
    templateCode?: string;
    subject: string;
    status: EmailStatus;
    provider: string;
    recipientCount: number;
    createdAt: string;
    sentAt?: string;
  }[];
};`)}

      ${apiCard('get-detail', 'GET', '/logs/:tenantId/email/:emailCode', 'Email details',
        'Returns the full audit record for a single email including all recipients and event history. Intended for troubleshooting and compliance.',
        `// emailCode in path — no request body`,
        `type EmailDetailsResponse = {
  id: number;
  emailCode: string;
  templateCode?: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  htmlBody: string;
  status: EmailStatus;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
  recipients: {
    type: string;
    emailAddress: string;
    userId?: string;
  }[];
  events: {
    eventType: string;
    eventMessage?: string;
    createdAt: string;
  }[];
  createdAt: string;
  sentAt?: string;
};`)}

    </main>`;

  res.type('html').send(renderPage('Logs &amp; Audit | Email API', body, logoUrl));
});

export default router;
