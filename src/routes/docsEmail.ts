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
      <p>Multi-tenant email delivery with templates, sending, and audit logs. Every request requires
         <code>X-Tenant-ID</code>, <code>X-APIKEY</code>, and <code>X-Hostname</code> headers.</p>
    </header>
    <nav class="site-nav">
      <a href="${withBasePath('/docs/send')}">Send Email</a>
      <a href="${withBasePath('/docs/templates')}">Templates</a>
      <a href="${withBasePath('/docs/logs')}">Logs</a>
      <a href="${withBasePath('/docs/health')}">Health</a>
      <a href="${withBasePath('/docs/template-help')}">Template Help</a>
    </nav>

    <main class="content-shell">

      <section class="doc-card">
        <div class="doc-card-header"><div><div class="doc-card-title">API Sections</div></div></div>
        <div class="doc-card-body stack">
          <p><strong>This API is organized into focused sections. Choose one below:</strong></p>
          <ul>
            <li><a href="${withBasePath('/docs/send')}">Send Email</a> — Direct and templated sending, with preview rendering</li>
            <li><a href="${withBasePath('/docs/templates')}">Templates</a> — Create, list, update, delete email templates</li>
            <li><a href="${withBasePath('/docs/logs')}">Logs &amp; Audit</a> — Retrieve sent email records and full audit trail</li>
            <li><a href="${withBasePath('/docs/template-help')}">Template Help</a> — How to use the template language and render options</li>
          </ul>
        </div>
      </section>

      <section class="doc-card">
        <div class="doc-card-header"><div><div class="doc-card-title">Shared types</div></div></div>
        <div class="doc-card-body">
          <pre class="code-block">${sharedTypes}</pre>
        </div>
      </section>

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
