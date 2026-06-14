export interface SendParams {
  fromName: string;
  fromEmail: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  htmlBody: string;
  attachments?: Array<{ filename: string; contentType: string; content: string }>;
}

export interface ProviderResult {
  messageId?: string;
  providerResponse?: string;
}

async function sendViaResend(secret: string, params: SendParams): Promise<ProviderResult> {
  const body: Record<string, unknown> = {
    from: `${params.fromName} <${params.fromEmail}>`,
    to: params.toAddresses,
    subject: params.subject,
    html: params.htmlBody,
  };
  if (params.ccAddresses.length > 0) body.cc = params.ccAddresses;
  if (params.bccAddresses.length > 0) body.bcc = params.bccAddresses;
  if (params.attachments && params.attachments.length > 0) {
    body.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + secret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error((data?.message as string) || `Resend error: ${res.status}`);
  }
  return { messageId: data.id as string | undefined, providerResponse: JSON.stringify(data) };
}

async function sendViaSendGrid(secret: string, params: SendParams): Promise<ProviderResult> {
  const body: Record<string, unknown> = {
    personalizations: [
      {
        to: params.toAddresses.map(e => ({ email: e })),
        ...(params.ccAddresses.length > 0 ? { cc: params.ccAddresses.map(e => ({ email: e })) } : {}),
        ...(params.bccAddresses.length > 0 ? { bcc: params.bccAddresses.map(e => ({ email: e })) } : {}),
      },
    ],
    from: { email: params.fromEmail, name: params.fromName },
    subject: params.subject,
    content: [{ type: 'text/html', value: params.htmlBody }],
  };

  if (params.attachments && params.attachments.length > 0) {
    body.attachments = params.attachments.map(a => ({
      content: a.content,
      filename: a.filename,
      type: a.contentType,
    }));
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + secret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid error: ${res.status} ${text}`);
  }
  const messageId = res.headers.get('x-message-id') || undefined;
  return { messageId, providerResponse: '' };
}

export async function sendViaProvider(
  providerName: string,
  providerSecret: string,
  params: SendParams,
): Promise<ProviderResult> {
  const name = providerName.toLowerCase().trim();
  switch (name) {
    case 'resend':
      return sendViaResend(providerSecret, params);
    case 'sendgrid':
      return sendViaSendGrid(providerSecret, params);
    default:
      throw new Error(`Unsupported email provider: ${providerName}`);
  }
}
