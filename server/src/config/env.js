import 'dotenv/config';
import { z } from 'zod';

// Validate configuration once at boot - fail fast on misconfiguration.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Sessions (server-side, revocable). Finance and Administrators get shorter limits.
  SESSION_HOURS: z.coerce.number().positive().max(24).default(8),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().max(720).default(30),
  PRIVILEGED_SESSION_HOURS: z.coerce.number().positive().max(24).default(4),
  PRIVILEGED_IDLE_MINUTES: z.coerce.number().positive().max(240).default(15),
  // When true (and Microsoft sign-in is configured), Finance and Administrators must sign in with
  // Microsoft - so the company's MFA / Conditional Access applies. BREAK_GLASS_EMAILS may still use
  // a password (emergency administrator accounts; keep the list short and monitored).
  PRIVILEGED_SSO_ONLY: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  BREAK_GLASS_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)),
  // Malware scanning of uploads via ClamAV (clamd). When CLAMAV_HOST is set, every upload is
  // scanned and rejected if infected - or if the scanner cannot be reached (fail closed).
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
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
  // Update manager / title / department from Microsoft Graph at every SSO sign-in
  SSO_SYNC_DIRECTORY: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Voyage T&E <no-reply@company.local>'),
  ESCALATION_CRON: z.string().default('*/15 * * * *'),
  // Requests per minute per signed-in session (per API instance)
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  // Log every request (off by default in production; nginx access logs cover it)
  REQUEST_LOGGING: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
// In production request logging is opt-in (nginx access logs already cover it).
if (isProd && process.env.REQUEST_LOGGING === undefined) env.REQUEST_LOGGING = false;

const PLACEHOLDER = /change-me|replace-with|your-|example|changeme|secret123/i;

/**
 * Extra rules that only apply in production. Returns a list of problems (empty = OK).
 * Exported so it can be unit tested.
 */
export function productionProblems(e) {
  const problems = [];
  if (e.JWT_SECRET.length < 32 || PLACEHOLDER.test(e.JWT_SECRET)) {
    problems.push('JWT_SECRET must be a random value of at least 32 characters (node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))").');
  }
  if (PLACEHOLDER.test(e.DATABASE_URL)) problems.push('DATABASE_URL still contains a placeholder password.');
  for (const origin of e.CLIENT_URL.split(',').map((s) => s.trim())) {
    if (!origin.startsWith('https://')) problems.push(`CLIENT_URL "${origin}" must use https:// in production (session cookies are Secure).`);
  }
  if (!e.UPLOAD_DIR.startsWith('/')) problems.push(`UPLOAD_DIR "${e.UPLOAD_DIR}" must be an absolute path in production (e.g. /var/lib/voyage/uploads, shared storage when running several servers).`);
  if (e.SSO_ENABLED && !e.AZURE_AD_REDIRECT_URI.startsWith('https://')) problems.push('AZURE_AD_REDIRECT_URI must use https:// in production.');
  if (e.SMTP_HOST && PLACEHOLDER.test(e.SMTP_PASS ?? '')) problems.push('SMTP_PASS still contains a placeholder.');
  return problems;
}

const problems = [];
if (env.SSO_ENABLED && !(env.AZURE_AD_TENANT_ID && env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET)) {
  problems.push('SSO_ENABLED=true needs AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.');
}
if (isProd) problems.push(...productionProblems(env));
if (env.PRIVILEGED_SSO_ONLY && !env.SSO_ENABLED) problems.push('PRIVILEGED_SSO_ONLY=true needs Microsoft sign-in (SSO_ENABLED=true), or Finance and Administrators could not sign in.');
// Not fatal, but should be fixed before go-live (see docs/SECURITY.md).
if (isProd && !env.CLAMAV_HOST) console.warn('[security] CLAMAV_HOST is not set: uploaded receipts are NOT scanned for malware.');
if (isProd && !env.PRIVILEGED_SSO_ONLY) console.warn('[security] PRIVILEGED_SSO_ONLY is off: Finance and Administrators can sign in with a password (no company MFA).');
if (problems.length) {
  console.error('Refusing to start - fix the configuration:');
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
