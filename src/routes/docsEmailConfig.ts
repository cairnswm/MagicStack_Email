import { Router, Request, Response } from 'express';

const router = Router();
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const docsPath = `${basePath}/docs`;

function withBasePath(routePath: string): string {
  return `${basePath}${routePath}` || routePath;
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

router.get('/', (_req: Request, res: Response) => {
  const logoUrl = withBasePath('/email.svg');
  const body = `
    <header class="site-header">
      <span class="base-url">${docsPath}</span>
      <img src="${logoUrl}" alt="" style="width:2rem;height:2rem;vertical-align:middle;margin-right:0.5rem;" />
      <h1>Email Configuration</h1>
      <p>Configure headers, API key permissions, tenant properties, and provider secrets before sending email through the service.</p>
    </header>

    <nav class="site-nav" style="margin-bottom:0;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;">
      <a href="${withBasePath('/docs/config')}" style="font-weight:600;color:#2d7a2d;">Configuration</a>
      <a href="${withBasePath('/docs/send')}">Send Email</a>
      <a href="${withBasePath('/docs/templates')}">Templates</a>
      <a href="${withBasePath('/docs/logs')}">Logs</a>
      <a href="${withBasePath('/docs/health')}">Health</a>
      <a href="${withBasePath('/docs/template-help')}">Template Help</a>
    </nav>

    <nav class="site-nav" style="margin-top:0.75rem;font-size:0.875rem;">
      <span style="color:#666;font-weight:500;">On this page:</span>
      <a href="#headers">Required Headers</a>
      <a href="#apikey">API Key</a>
      <a href="#tenant">Tenant Properties</a>
      <a href="#smtp">SMTP</a>
      <a href="#secrets">Provider Secrets</a>
      <a href="#example">Example Request</a>
    </nav>

    <main class="content-shell stack">

      <section class="doc-card" id="headers">
        <div class="doc-card-header"><div><div class="endpoint-path">Request Requirements</div><div class="doc-card-title">Required headers on every request</div></div></div>
        <div class="doc-card-body stack">
          <p>Every endpoint requires these headers. Missing any of them returns <code>400</code>.</p>
          <pre class="code-block">X-Tenant-ID: &lt;tenant-uuid&gt;
X-APIKEY: &lt;api-key&gt;
X-Hostname: &lt;calling-hostname&gt;
Content-Type: application/json</pre>
          <table class="data-table">
            <thead><tr><th>Header</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>X-Tenant-ID</code></td><td>Selects tenant-scoped templates, sender settings, provider config, and audit records.</td></tr>
              <tr><td><code>X-APIKEY</code></td><td>Authorizes the caller and is forwarded when the service fetches tenant secrets.</td></tr>
              <tr><td><code>X-Hostname</code></td><td>Identifies the caller hostname for audit logging and downstream authorization checks.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="doc-card" id="apikey">
        <div class="doc-card-header"><div><div class="endpoint-path">API Key</div><div class="doc-card-title">Caller key configuration</div></div></div>
        <div class="doc-card-body stack">
          <p>The caller must send a valid API key in <code>X-APIKEY</code>.</p>
          <p>The <code>sendByEmail</code> setting is configured in the key store, not in tenant properties.</p>
          <p>If the request sends raw email addresses like <code>{ "email": "recipient@example.com" }</code>, the API key must have this property:</p>
          <pre class="code-block">sendByEmail = true</pre>
          <p><code>1</code> is also accepted instead of <code>true</code>. If this property is missing, the caller can only send to recipients resolved by <code>userId</code>.</p>
        </div>
      </section>

      <section class="doc-card" id="tenant">
        <div class="doc-card-header"><div><div class="endpoint-path">Tenant Properties</div><div class="doc-card-title">Required tenant configuration</div></div></div>
        <div class="doc-card-body stack">
          <p>For provider-based sending, configure these tenant properties in the Auth/Tenant system:</p>
          <table class="data-table">
            <thead><tr><th>Property</th><th>Required</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>email_provider</code></td><td>Yes</td><td>Selects whether the <code>resent</code> or <code>smtp</code> configuration is used.</td></tr>
              <tr><td><code>sender_name</code></td><td>Yes</td><td>Display name shown as the sender.</td></tr>
              <tr><td><code>sender_email</code></td><td>Yes</td><td>Sender email address stored as a tenant property.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="doc-card" id="smtp">
        <div class="doc-card-header"><div><div class="endpoint-path">SMTP Settings</div><div class="doc-card-title">Additional configuration for SMTP tenants</div></div></div>
        <div class="doc-card-body stack">
          <p>If <code>email_provider=smtp</code>, configure these additional tenant properties:</p>
          <pre class="code-block">smtp_username
smtp_host
smtp_port</pre>
          <p>For SMTP tenants, <code>smtp_username</code> is used as the effective sender email address.</p>
        </div>
      </section>

      <section class="doc-card" id="secrets">
        <div class="doc-card-header"><div><div class="endpoint-path">Tenant Secrets</div><div class="doc-card-title">Provider credentials are loaded dynamically</div></div></div>
        <div class="doc-card-body stack">
          <p>Provider credentials are not stored in this service. They must exist as tenant secrets in the Auth/Tenant system.</p>
          <table class="data-table">
            <thead><tr><th>Provider</th><th>Secret name</th><th>Secret value</th></tr></thead>
            <tbody>
              <tr><td>Resend</td><td><code>resent</code></td><td>The Resend API key.</td></tr>
              <tr><td>SMTP</td><td><code>smtp</code></td><td>The SMTP password.</td></tr>
            </tbody>
          </table>
          <p>For SMTP, the username is not stored in the secret. Set it in the tenant property <code>smtp_username</code>.</p>
        </div>
      </section>

      <section class="doc-card" id="example">
        <div class="doc-card-header"><div><div class="endpoint-path">Example</div><div class="doc-card-title">Direct send with all required headers</div></div></div>
        <div class="doc-card-body stack">
          <pre class="code-block">curl -X POST "https://email.magicrunez.com/send" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-ID: &lt;tenant-uuid&gt;" \\
  -H "X-APIKEY: &lt;api-key&gt;" \\
  -H "X-Hostname: app.example.com" \\
  -d '{
    "subject": "Welcome to MagicStack",
    "htmlBody": "&lt;h1&gt;Hello&lt;/h1&gt;&lt;p&gt;Your account is ready.&lt;/p&gt;",
    "to": [{ "email": "recipient@example.com" }]
  }'</pre>
          <p>See <a href="${withBasePath('/docs/send')}">Send Email</a> for full direct-send and template-send request bodies.</p>
        </div>
      </section>

    </main>`;

  res.type('html').send(renderPage('Configuration | Email API', body, logoUrl));
});

export default router;