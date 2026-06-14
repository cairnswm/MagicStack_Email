export type EmailStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface EmailRecipient {
  email?: string;
  userId?: string;
}

export interface EmailAttachment {
  type: 'upload' | 'file';
  filename?: string;
  contentType?: string;
  content?: string;
  fileCode?: string;
}

export interface EmailImage {
  type: 'upload' | 'imaginary';
  filename?: string;
  contentType?: string;
  content?: string;
  imageCode?: string;
}

export interface NormalizedRecipient {
  recipientType: 'to' | 'cc' | 'bcc';
  recipientSource: 'email' | 'user';
  userId?: string;
  emailAddress: string;
  displayName?: string;
}

export interface SendEmailRequest {
  subject: string;
  htmlBody: string;
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
  images?: EmailImage[];
}

export interface SendTemplateEmailRequest {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
  images?: EmailImage[];
  parameters: Record<string, string | number | boolean | null>;
}
