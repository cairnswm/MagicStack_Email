import * as nodemailer from 'nodemailer';

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

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
}

async function sendViaResend(secret: string, params: SendParams): Promise<ProviderResult> {
  const from = params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail;
  const body: Record<string, unknown> = {
    from,
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

async function sendViaSmtp(password: string, smtpConfig: SmtpConfig, params: SendParams): Promise<ProviderResult> {
  const secure = smtpConfig.port === 465;
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure,
    auth: {
      user: smtpConfig.username,
      pass: password,
    },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: `${params.fromName} <${params.fromEmail}>`,
    to: params.toAddresses.join(', '),
    subject: params.subject,
    html: params.htmlBody,
  };

  if (params.ccAddresses.length > 0) mailOptions.cc = params.ccAddresses.join(', ');
  if (params.bccAddresses.length > 0) mailOptions.bcc = params.bccAddresses.join(', ');

  if (params.attachments && params.attachments.length > 0) {
    mailOptions.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType,
    }));
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, providerResponse: JSON.stringify({ response: info.response }) };
}

export async function sendViaProvider(
  providerName: string,
  providerSecret: string,
  params: SendParams,
  smtpConfig?: SmtpConfig,
): Promise<ProviderResult> {
  const name = providerName.toLowerCase().trim();
  switch (name) {
    case 'resend':
      return sendViaResend(providerSecret, params);
    case 'sendgrid':
      return sendViaSendGrid(providerSecret, params);
    case 'smtp':
      if (!smtpConfig) throw new Error('SMTP configuration is required for smtp provider');
      return sendViaSmtp(providerSecret, smtpConfig, params);
    default:
      throw new Error(`Unsupported email provider: ${providerName}`);
  }
}
