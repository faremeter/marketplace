import { ServerClient } from "postmark";
import { logger } from "../logger.js";
import { db } from "../db/instance.js";

export interface EmailTemplateVars {
  verification: { verification_url: string; user_email: string };
  welcome: { user_email: string; login_url: string };
  invitation: {
    invitation_url: string;
    organization_name: string;
    inviter_email: string;
    role: string;
  };
  password_reset: {
    reset_url: string;
    user_email: string;
    expires_in_hours: number;
  };
}

export type EmailType = keyof EmailTemplateVars;

interface EmailConfig {
  from_email: string;
  site_url: string;
  template_ids: {
    verification: number;
    welcome: number;
    invitation: number;
    password_reset: number;
  };
}

async function getEmailConfig(): Promise<{
  apiKey: string;
  fromEmail: string;
  siteUrl: string;
  templateIds: Record<EmailType, number>;
} | null> {
  const apiKey = process.env.POSTMARK_API_KEY;
  if (!apiKey) {
    return null;
  }

  const settings = await db
    .selectFrom("admin_settings")
    .select("email_config")
    .where("id", "=", 1)
    .executeTakeFirst();

  if (!settings?.email_config) {
    return null;
  }

  const config = settings.email_config as EmailConfig;
  if (!config.from_email) {
    return null;
  }

  return {
    apiKey,
    fromEmail: config.from_email,
    siteUrl: config.site_url || "",
    templateIds: {
      verification: config.template_ids?.verification || 0,
      welcome: config.template_ids?.welcome || 0,
      invitation: config.template_ids?.invitation || 0,
      password_reset: config.template_ids?.password_reset || 0,
    },
  };
}

export async function sendEmail<T extends EmailType>(
  to: string,
  type: T,
  variables: EmailTemplateVars[T],
): Promise<void> {
  const config = await getEmailConfig();

  if (!config) {
    logger.warn(`Postmark not configured, skipping ${type} email to ${to}`);
    return;
  }

  const templateId = config.templateIds[type];
  if (!templateId) {
    logger.warn(`Template ID not configured for email type: ${type}`);
    return;
  }

  const client = new ServerClient(config.apiKey);

  await client.sendEmailWithTemplate({
    From: config.fromEmail,
    To: to,
    TemplateId: templateId,
    TemplateModel: variables,
  });

  logger.info(`Sent ${type} email to ${to}`);
}

export async function getSiteUrl(): Promise<string | null> {
  const settings = await db
    .selectFrom("admin_settings")
    .select("email_config")
    .where("id", "=", 1)
    .executeTakeFirst();

  if (!settings?.email_config) {
    return null;
  }

  const config = settings.email_config as EmailConfig;
  return config.site_url || null;
}
