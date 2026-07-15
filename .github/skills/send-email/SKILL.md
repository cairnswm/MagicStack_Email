---
name: send-email
description: 'Configure a function in a new or existing application to send email through the MagicStack Email Service at https://email.magicrunez.com. Use when a user asks to wire up direct email sending, template email sending by slug or code, or how to configure the tenant, tenant secrets, and key-store settings required before the application can send email.'
argument-hint: 'Describe the app, language, and whether the function should send direct email or template email.'
user-invocable: true
---

# Send Email

Use this skill when the user wants a function in an application to send email through the hosted MagicStack Email Service at `https://email.magicrunez.com`.

This skill covers:
- Configuring a reusable send-email function in a new application
- Sending a direct email with subject and HTML body
- Sending an email from a stored template by slug/code
- Setting the required request headers
- Explaining which environment variables, API key settings, tenant properties, and tenant secrets must be configured before the function can send email

## Rules

- Treat the hosted base URL as `https://email.magicrunez.com` unless the user gives a different environment. Store this as MAGICSTACK_EMAIL_URL in the .env.
- Default to implementing a small reusable function that accepts business data, builds the request, and calls the email service.
- Always include these headers on every request:
  - `X-Tenant-ID`
  - `X-APIKEY`
  - `X-Hostname`
- Use `POST /send` for direct email.
- Use `POST /send/{templateCode}` for template email. If the user says "slug", treat that as the template code used in the path.
- If the user sends recipients by raw email address, tell them the API key must have `sendByEmail=true` or `sendByEmail=1` in the key store.
- If the user cannot send yet, explain that provider credentials are not stored in this service. They must be configured in the Auth/Tenant system as tenant properties and secrets.

## Default Workflow

When the user asks for help sending email from an app, do this:

1. Add or describe the environment variables the application needs, including `MAGICSTACK_EMAIL_URL`, tenant id, API key, and hostname.
2. Create a reusable function that sends either `POST /send` or `POST /send/{templateCode}`.
3. Set `Content-Type`, `X-Tenant-ID`, `X-APIKEY`, and `X-Hostname` on every request.
4. Use the direct-send body when the app provides `subject` and `htmlBody`.
5. Use the template-send body when the app provides a template slug/code and `parameters`.
6. If sending fails, check key-store configuration first for `sendByEmail`, then tenant properties, then tenant secrets.

## Required Headers

Always tell the user to send these headers:

```http
X-Tenant-ID: <tenant-uuid>
X-APIKEY: <api-key>
X-Hostname: <calling-hostname>
Content-Type: application/json
```

Header guidance:
- `X-Tenant-ID`: the tenant whose templates, sender settings, and provider configuration should be used.
- `X-APIKEY`: the calling application's API key. This is also used when the service fetches tenant secrets.
- `X-Hostname`: the caller hostname for audit logging and downstream authorization checks.

If any of these three headers are missing, the service returns `400`.

## Direct Send

Use this endpoint:

```http
POST https://email.magicrunez.com/send
```

Minimum body:

```json
{
  "subject": "Welcome to MagicStack",
  "htmlBody": "<h1>Hello</h1><p>Your account is ready.</p>",
  "to": [
    { "email": "recipient@example.com" }
  ]
}
```

Full example:

```bash
curl -X POST "https://email.magicrunez.com/send" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <tenant-uuid>" \
  -H "X-APIKEY: <api-key>" \
  -H "X-Hostname: app.example.com" \
  -d '{
    "subject": "Welcome to MagicStack",
    "htmlBody": "<h1>Hello</h1><p>Your account is ready.</p>",
    "to": [{ "email": "recipient@example.com" }],
    "cc": [],
    "bcc": [],
    "attachments": [],
    "images": []
  }'
```

Direct-send request shape:

```ts
type EmailRecipient = {
  email?: string;
  userId?: string;
};

type SendEmailRequest = {
  subject: string;
  htmlBody: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: Array<{
    type: 'upload' | 'file';
    filename?: string;
    contentType?: string;
    content?: string;
    fileCode?: string;
  }>;
  images?: Array<{
    type: 'upload' | 'imaginary';
    filename?: string;
    contentType?: string;
    content?: string;
    imageCode?: string;
  }>;
};
```

## Template Send By Slug Or Code

Use this endpoint:

```http
POST https://email.magicrunez.com/send/{templateCode}
```

Important wording for users:
- If they say "template slug", explain that the send endpoint expects the template code/slug in the URL path.
- The value must match the stored template's `code`.

Minimum body:

```json
{
  "to": [
    { "email": "recipient@example.com" }
  ],
  "parameters": {
    "firstName": "Alice"
  }
}
```

Full example:

```bash
curl -X POST "https://email.magicrunez.com/send/welcome-email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <tenant-uuid>" \
  -H "X-APIKEY: <api-key>" \
  -H "X-Hostname: app.example.com" \
  -d '{
    "to": [{ "email": "recipient@example.com" }],
    "cc": [],
    "bcc": [],
    "parameters": {
      "firstName": "Alice",
      "productName": "MagicStack"
    },
    "attachments": [],
    "images": []
  }'
```

Template-send request shape:

```ts
type SendTemplateEmailRequest = {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: Array<{
    type: 'upload' | 'file';
    filename?: string;
    contentType?: string;
    content?: string;
    fileCode?: string;
  }>;
  images?: Array<{
    type: 'upload' | 'imaginary';
    filename?: string;
    contentType?: string;
    content?: string;
    imageCode?: string;
  }>;
  parameters: Record<string, unknown>;
};
```

## Responses

Tell the user to expect one of these success patterns:

```json
{
  "data": {
    "emailId": 123,
    "emailCode": "uuid-or-generated-code",
    "status": "sent",
    "provider": "resend"
  }
}
```

```json
{
  "data": {
    "emailId": 123,
    "emailCode": "uuid-or-generated-code",
    "status": "queued",
    "provider": "resend",
    "templateCode": "welcome-email"
  }
}
```

Response guidance:
- `200` usually means synchronous delivery completed immediately.
- `202` usually means the email was queued for asynchronous delivery.

## How To Explain Required Key Configuration

When the user asks how to configure the keys required to send email, tell them this service depends on configuration that lives outside this repository.

Explain it in these groups.

### 1. API Key Configuration

The caller must use a valid `X-APIKEY` stored in the key store.

If the request uses direct email addresses such as `{ "email": "recipient@example.com" }`, the API key must have this property:

```text
sendByEmail = true
```

`1` is also accepted instead of `true`.

If `sendByEmail` is not enabled, the caller can only send to recipients that resolve by `userId`.

Recommended wording to the user:
- Configure the API key in the key store so the property `sendByEmail` is set to `true` or `1`.
- Then pass that API key in the `X-APIKEY` header on every send request.

### 2. Tenant Properties

These tenant properties must be set:

```text
email_provider
sender_name
sender_email
```

Property meaning:
- `email_provider`: selects whether the `resent` or `smtp` configuration is used.
- `sender_name`: display name shown as the sender.
- `sender_email`: the sender email address stored as a tenant property.

### 3. SMTP-Specific Tenant Properties

If `email_provider=smtp`, tell the user they must configure as tenant properties:

```text
smtp_username
smtp_host
smtp_port
```

SMTP note:
- For SMTP tenants, `smtp_username` is used as the sending email address.
- `sender_email` is not used as the effective sender for SMTP delivery.

### 4. Tenant Secret

The provider credential must be stored as a tenant secret in the Auth/Tenant system.

Tell the user:
- For Resend, create a tenant secret named `resent` and set its value to the Resend API key.
- For SMTP, create a tenant secret named `smtp` and set its value to the SMTP password.
- For SMTP, the username is stored separately in the `smtp_username` tenant property.

Important:
- This email service fetches provider credentials dynamically at send time.
- Provider credentials are not stored locally in this repository or in the email service database.

## Failure Guidance

Use these explanations when helping users troubleshoot:
- `400 Missing required headers`: one or more of `X-Tenant-ID`, `X-APIKEY`, `X-Hostname` was not sent.
- `400 Tenant email_provider property is not configured`: tenant provider config is missing.
- `400 Tenant sender_email property is not configured`: non-SMTP sender address is missing.
- `400 Tenant smtp_username property is not configured`: SMTP sender username is missing.
- `403 API key is only permitted to send to registered users`: `sendByEmail` is not enabled for raw email recipients.
- `404 Template '<code>' not found`: the template code/slug does not exist for that tenant or is inactive.
- `500 Provider secret '<name>' not found`: the tenant secret is missing or inaccessible.

## Response Style

When answering a user with this skill:
1. Start with the exact endpoint and headers they need.
2. Give a minimal request example first.
3. If they mention a template slug, map it to `POST /send/{templateCode}`.
4. If they ask why sending fails, check header requirements, `sendByEmail`, tenant properties, and tenant secret names in that order.
5. If they ask how to configure the required keys, explain that setup happens in the Auth/Tenant and API key systems, not inside this email service repo.