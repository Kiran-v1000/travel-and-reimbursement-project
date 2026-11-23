import 'dotenv/config';
import { z } from 'zod';

// Validate configuration once at boot - fail fast on misconfiguration.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CLIENT_URL: z.string().default('http://localhost:5195'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  SSO_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Microsoft Entra ID (Azure AD) single sign-on
  AZURE_AD_TENANT_ID: z.string().optional(),
  AZURE_AD_CLIENT_ID: z.string().optional(),
  AZURE_AD_CLIENT_SECRET: z.string().optional(),
  AZURE_AD_REDIRECT_URI: z.string().default('http://localhost:5195/api/auth/sso/callback'),
  SSO_ALLOWED_DOMAINS: z
    .string()
    .default('utthunga.com')
    .transform((v) => v.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)),
  SSO_AUTO_PROVISION: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Voyage T&E <no-reply@company.local>'),
  ESCALATION_CRON: z.string().default('*/15 * * * *'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

if (env.SSO_ENABLED && !(env.AZURE_AD_TENANT_ID && env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET)) {
  console.error('SSO_ENABLED=true needs AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.');
  process.exit(1);
}
export const isProd = env.NODE_ENV === 'production';
