# Email Service API Specification

## Common Headers

Every API endpoint requires the following headers:

```http
X-Tenant-ID: {tenant-id}
X-APIKEY: {api-key}
X-Hostname: {originating-hostname}
```

The tenant ID is used to determine configuration, template ownership, sender information, provider selection, and access permissions. The hostname is stored in the email audit trail and can be used for monitoring and security analysis.

x-tenant-id, x-apikey and the x-hostname are all required when getSecretByName or getPropertyByName are called.

---

# Shared Types

```ts
type EmailRecipient =
{
    email?: string;
    userId?: string;
};

type EmailAttachment =
{
    type: 'upload' | 'file';
    filename?: string;
    contentType?: string;
    content?: string;
    fileCode?: string;
};

type EmailImage =
{
    type: 'upload' | 'imaginary';
    filename?: string;
    contentType?: string;
    content?: string;
    imageCode?: string;
};

type EmailStatus =
    | 'queued'
    | 'processing'
    | 'sent'
    | 'failed'
    | 'cancelled';
```

---

# POST /send

Sends an email without using a stored template.

## Request

```ts
type SendEmailRequest =
{
    subject: string;
    htmlBody: string;

    to: EmailRecipient[];

    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];

    attachments?: EmailAttachment[];
    images?: EmailImage[];
};
```

## Response

```ts
type SendEmailResponse =
{
    emailId: number;
    emailCode: string;
    status: EmailStatus;
    provider: string;
};
```

## Behaviour

The service validates the API key and confirms the caller has permission to send email.

The service loads tenant configuration from the Auth/Tenant Service. At minimum it retrieves:

```text
email_provider
email_delivery_mode
sender_name
sender_email
```

The service creates a record in the email table and generates a unique email code.

All recipients are validated. User IDs are resolved through the Auth/Tenant Service. Direct email addresses require the API key to possess the external email permission.

Records are inserted into:

```text
email
email_recipient
email_attachment
email_image
```

Attachment references are stored but files are not downloaded yet.

If the tenant is configured for synchronous delivery, the provider secret is loaded from the Auth/Tenant Service and the email is immediately sent.

If the tenant is configured for asynchronous delivery, an email_queue record is created and the email is returned as queued.

Email events are written into email_event throughout processing.

---

# POST /send/{templateCode}

Sends an email using a stored template.

## Request

```ts
type SendTemplateEmailRequest =
{
    to: EmailRecipient[];

    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];

    attachments?: EmailAttachment[];
    images?: EmailImage[];

    parameters:
    {
        [key: string]: string | number | boolean | null;
    };
};
```

## Response

```ts
type SendTemplateEmailResponse =
{
    emailId: number;
    emailCode: string;
    templateCode: string;
    status: EmailStatus;
    provider: string;
};
```

## Behaviour

The service validates the API key and tenant.

The template is loaded using:

```sql
tenant_id
template_code
```

The service renders both the subject template and HTML template using the supplied parameters.

A record is created in:

```text
email_template_render
```

The rendered email is stored in the email table so that future template changes do not affect historical records.

Recipient resolution, attachment handling, image handling, synchronous delivery, asynchronous delivery, logging and auditing behave exactly as described in the /send endpoint.

---

# GET /logs/{tenantId}/email

Returns a paginated list of emails.

## Request

Query Parameters

```ts
type EmailLogQuery =
{
    page?: number;
    pageSize?: number;

    status?: EmailStatus;

    templateCode?: string;

    fromDate?: string;
    toDate?: string;
};
```

## Response

```ts
type EmailLogItem =
{
    id: number;
    emailCode: string;

    templateCode?: string;

    subject: string;

    status: EmailStatus;

    provider: string;

    recipientCount: number;

    createdAt: string;
    sentAt?: string;
};

type EmailLogResponse =
{
    total: number;
    page: number;
    pageSize: number;
    items: EmailLogItem[];
};
```

## Behaviour

The service validates the tenant and API key.

Only records belonging to the requested tenant are returned.

The email table is queried along with recipient counts.

No provider secrets are required.

---

# GET /logs/{tenantId}/email/{emailCode}

Returns full email details.

## Response

```ts
type EmailDetailsResponse =
{
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

    recipients:
    {
        type: string;
        emailAddress: string;
        userId?: string;
    }[];

    events:
    {
        eventType: string;
        eventMessage?: string;
        createdAt: string;
    }[];

    createdAt: string;
    sentAt?: string;
};
```

## Behaviour

The service retrieves data from:

```text
email
email_recipient
email_event
```

The endpoint is intended for troubleshooting, administration and audit purposes.

---

# GET /template

Returns all templates for the tenant.

## Response

```ts
type EmailTemplateSummary =
{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
};

type GetTemplatesResponse =
{
    templates: EmailTemplateSummary[];
};
```

## Behaviour

Returns all templates owned by the tenant.

Templates belonging to other tenants must never be visible.

---

# GET /template/{code}

Returns a single template.

## Response

```ts
type GetTemplateResponse =
{
    id: number;
    code: string;
    name: string;
    description?: string;

    subjectTemplate: string;
    htmlTemplate: string;

    isActive: boolean;

    createdAt: string;
    updatedAt: string;
};
```

## Behaviour

Loads the template by tenant and template code.

---

# POST /template

Creates a template.

## Request

```ts
type CreateTemplateRequest =
{
    code: string;
    name: string;
    description?: string;

    subjectTemplate: string;
    htmlTemplate: string;
};
```

## Response

```ts
type CreateTemplateResponse =
{
    id: number;
    code: string;
};
```

## Behaviour

Creates a new template owned by the tenant.

Template codes must be unique within a tenant.

Inserts into:

```text
email_template
```

---

# PUT /template/{code}

Updates a template.

## Request

```ts
type UpdateTemplateRequest =
{
    name?: string;
    description?: string;

    subjectTemplate?: string;
    htmlTemplate?: string;

    isActive?: boolean;
};
```

## Response

```ts
type UpdateTemplateResponse =
{
    success: boolean;
};
```

## Behaviour

Updates the tenant-owned template.

Historical emails are unaffected because rendered content is already stored in the email table.

---

# DELETE /template/{code}

Soft deletes a template.

## Response

```ts
type DeleteTemplateResponse =
{
    success: boolean;
};
```

## Behaviour

The template is marked inactive.

Existing email records remain unchanged.

---

# Internal Batch Process: Queue Processor

## Schedule

Runs continuously or every few seconds.

## Behaviour

Queries:

```sql
SELECT *
FROM email_queue
WHERE status IN ('queued','failed')
AND next_attempt_at <= NOW()
```

The worker locks a queue record and marks it as processing.

The worker loads the email record.

The worker loads tenant properties.

The worker loads provider secrets.

The worker resolves attachment file codes from the Files Service.

The worker resolves image codes from the Imaginary Service.

The worker creates a normalized email message.

The appropriate provider adapter is loaded.

The provider sends the email.

Success updates:

```text
email.status = sent
email.sent_at
email.provider_message_id

email_queue.status = completed
```

Failure updates:

```text
email.status = failed
email.failed_at

email_queue.attempt_count += 1
```

A corresponding email_event record is created.

If retries remain, next_attempt_at is recalculated.

If retries are exhausted, the queue item is permanently marked failed.

---

# Internal Batch Process: Queue Recovery

## Schedule

Runs every few minutes.

## Behaviour

Searches for queue records that have remained in processing state beyond a configured timeout.

These records are returned to queued status and may be retried.

This protects the system against worker crashes or unexpected shutdowns.

---

# Internal Batch Process: Log Cleanup

## Schedule

Runs daily.

## Behaviour

Applies retention policies.

Old email_event records may be archived or removed.

Old queue records marked completed may be removed.

Email records themselves are normally retained indefinitely unless tenant retention policies specify otherwise.

No email is deleted while related audit requirements still apply.
