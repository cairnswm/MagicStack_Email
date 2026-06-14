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

function renderPage(title: string, body: string, faviconUrl = '', autoFetch?: { url: string; label: string }) {
  const faviconTag = faviconUrl
    ? `<link rel="icon" type="image/svg+xml" href="${faviconUrl}" />`
    : '';
  const autoScript = autoFetch
    ? `<script>document.addEventListener('DOMContentLoaded',function(){fetchHealth(${JSON.stringify(autoFetch.url)},${JSON.stringify(autoFetch.label)},${JSON.stringify(withBasePath('/docs/' + autoFetch.label.toLowerCase().replace(/\s+/g, '')))});});</script>`
    : '';
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${faviconTag}
    <link rel="stylesheet" href="https://cdn.runeworkz.com/styles.css" />
  </head><body class="app-shell">${body}${autoScript}</body></html>`;
}

function apiCard(method: string, path: string, title: string, desc: string, reqType: string, resType: string): string {
  return `
  <section class="doc-card">
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

const sharedTypes = escHtml(
`type EmailRecipient = {
  email?: string;
  userId?: string;
};

type EmailAttachment = {
  type: 'upload' | 'file';
  filename?: string;
  contentType?: string;
  content?: string;   // base64
  fileCode?: string;
};

type EmailImage = {
  type: 'upload' | 'imaginary';
  filename?: string;
  contentType?: string;
  content?: string;   // base64
  imageCode?: string;
};

type EmailStatus =
  | 'queued' | 'processing'
  | 'sent'   | 'failed'
  | 'cancelled';`);

function buildBody(logoUrl: string): string {
  return `
    <header class="site-header">
      <span class="base-url">${basePath || '/'}</span>
      <img src="${logoUrl}" alt="" style="width:2rem;height:2rem;vertical-align:middle;margin-right:0.5rem;" />
      <h1>Email API</h1>
      <p>Multi-tenant email delivery. Every request requires
         <code>X-Tenant-ID</code>, <code>X-APIKEY</code>, and <code>X-Hostname</code> headers.</p>
    </header>
    <nav class="site-nav">
      <a href="${withBasePath('/')}">Docs</a>
      <a href="${withBasePath('/docs/health')}">Health</a>
      <a href="${withBasePath('/docs/dbhealth')}">DB Health</a>
    </nav>

    <main id="health-panel" style="display:none;" class="content-shell">
      <section class="doc-card">
        <div class="doc-card-header">
          <div>
            <div id="health-panel-title" class="doc-card-title">Health</div>
          </div>
        </div>
        <div class="doc-card-body" id="health-panel-body"></div>
      </section>
    </main>

    <main id="docs" class="content-shell">

      <section class="doc-card">
        <div class="doc-card-header"><div><div class="doc-card-title">Shared types</div></div></div>
        <div class="doc-card-body">
          <pre class="code-block">${sharedTypes}</pre>
        </div>
      </section>

      ${apiCard('POST', '/send', 'Send an email',
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

      ${apiCard('POST', '/send/:templateCode', 'Send a templated email',
        'Renders a stored template with the supplied parameters then sends it. Rendered content is stored in the audit trail so future template edits do not affect historical records.',
        `type SendTemplateEmailRequest = {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
  images?: EmailImage[];
  parameters: {
    [key: string]: string | number | boolean | null;
  };
};`,
        `type SendTemplateEmailResponse = {
  emailId: number;
  emailCode: string;
  templateCode: string;
  status: EmailStatus;
  provider: string;
};`)}

      ${apiCard('GET', '/logs/:tenantId/email', 'List email log',
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

      ${apiCard('GET', '/logs/:tenantId/email/:emailCode', 'Email details',
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

      ${apiCard('GET', '/template', 'List templates',
        'Returns all templates owned by the tenant. Templates from other tenants are never visible.',
        `// No body — tenant scoped via X-Tenant-ID header`,
        `type GetTemplatesResponse = {
  templates: {
    id: number;
    code: string;
    name: string;
    isActive: boolean;
  }[];
};`)}

      ${apiCard('GET', '/template/:code', 'Get template',
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

      ${apiCard('POST', '/template', 'Create template',
        'Creates a new template owned by the tenant. Template codes must be unique within the tenant.',
        `type CreateTemplateRequest = {
  code: string;
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate: string;
};`,
        `type CreateTemplateResponse = {
  id: number;
  code: string;
};`)}

      ${apiCard('PUT', '/template/:code', 'Update template',
        'Updates fields on an existing template. All fields are optional. Historical emails already sent are unaffected.',
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

      ${apiCard('DELETE', '/template/:code', 'Delete template',
        'Soft-deletes the template by marking it inactive. Existing email records are unchanged.',
        `// code in path — no request body`,
        `type DeleteTemplateResponse = {
  success: boolean;
};`)}

    </main>

    <script>
      function showDocs() {
        document.getElementById('health-panel').style.display = 'none';
        document.getElementById('docs').style.display = '';
        history.pushState(null, '', ${JSON.stringify(withBasePath('/'))});
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      async function fetchHealth(url, label, navPath) {
        document.getElementById('docs').style.display = 'none';
        const panel = document.getElementById('health-panel');
        const title = document.getElementById('health-panel-title');
        const body  = document.getElementById('health-panel-body');
        title.textContent = label;
        body.innerHTML = '<p class="muted">Loading\\u2026</p>';
        panel.style.display = '';
        if (navPath) history.pushState(null, '', navPath);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        try {
          const res  = await fetch(url);
          const data = await res.json();
          const statusColour = data.status === 'ok' ? '#2d7a2d' : '#b91c1c';
          const rows = Object.entries(data).map(([k, v]) =>
            '<tr><td><code>' + k + '</code></td><td>' + (v == null ? '<span class="muted">\\u2014</span>' : String(v)) + '</td></tr>'
          ).join('');
          body.innerHTML =
            '<p style="margin:0 0 0.75rem;font-weight:600;color:' + statusColour + '">' +
              (data.status === 'ok' ? '&#10003; OK' : '&#10007; ' + (data.status || 'error')) +
            '</p>' +
            '<table class="data-table"><tbody>' + rows + '</tbody></table>';
        } catch (err) {
          body.innerHTML = '<p style="color:#b91c1c">' + err.message + '</p>';
        }
      }
      window.addEventListener('popstate', function() {
        const path = location.pathname;
        if (path.endsWith('/docs/health')) fetchHealth(${JSON.stringify(withBasePath('/health'))}, 'Health');
        else if (path.endsWith('/docs/dbhealth')) fetchHealth(${JSON.stringify(withBasePath('/db/health'))}, 'DB Health');
        else showDocs();
      });
    </script>`;
}

router.get('/', (_req: Request, res: Response) => {
  const logoUrl = withBasePath('/email.svg');
  res.type('html').send(renderPage('Email API', buildBody(logoUrl), logoUrl));
});

router.get('/docs/health', (_req: Request, res: Response) => {
  const logoUrl = withBasePath('/email.svg');
  res.type('html').send(renderPage('Health | Email API', buildBody(logoUrl), logoUrl,
    { url: withBasePath('/health'), label: 'Health' }));
});

router.get('/docs/dbhealth', (_req: Request, res: Response) => {
  const logoUrl = withBasePath('/email.svg');
  res.type('html').send(renderPage('DB Health | Email API', buildBody(logoUrl), logoUrl,
    { url: withBasePath('/db/health'), label: 'DB Health' }));
});

export default router;
