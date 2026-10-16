import { z } from 'zod';

export const CONFIG = Symbol('CONFIG');

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
    /** TLS hacia la base: off (local), no-verify (Supabase en el MVP) o verify (con DB_SSL_CA si hace falta). */
    DB_SSL: z.enum(['off', 'no-verify', 'verify']).default('off'),
    DB_SSL_CA: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    /** Zona horaria con la que se decide "hoy" para vigencias de tarifas y parámetros. */
    ZONA_NEGOCIO: z.string().default('America/La_Paz'),
    /** Orígenes permitidos para CORS, separados por coma. Vacío = ninguno. */
    CORS_ORIGINS: z.string().default(''),
    /** Saltos de proxy confiables (para obtener la IP real). 0 = sin proxy. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_POR_MINUTO: z.coerce.number().int().min(1).default(120),

    /** Chromium para generar los PDF. Vacío = el que instale Playwright. */
    CHROMIUM_PATH: z.string().optional(),
    /** serverless = Chromium liviano para funciones (Vercel); local = el instalado en la máquina. */
    PDF_MODO: z.enum(['local', 'serverless']).default('local'),
    /** Solo contenedores sin sandbox de usuario (p. ej. Docker como root). */
    CHROMIUM_SIN_SANDBOX: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

    AUTH_MODE: z.enum(['oidc', 'dev']).default('oidc'),
    OIDC_ISSUER: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    OIDC_JWKS_URI: z.string().url().optional(),
    OIDC_EMAIL_CLAIM: z.string().default('email'),
    /** Solo AUTH_MODE=dev. Nunca en producción. */
    AUTH_DEV_SECRET: z.string().min(32, 'AUTH_DEV_SECRET debe tener al menos 32 caracteres').optional(),
  })
  .superRefine((c, ctx) => {
    const falta = (campo: string, msg: string) => ctx.addIssue({ code: 'custom', path: [campo], message: msg });
    if (c.AUTH_MODE === 'dev') {
      if (c.NODE_ENV === 'production') falta('AUTH_MODE', 'AUTH_MODE=dev está prohibido en producción');
      if (!c.AUTH_DEV_SECRET) falta('AUTH_DEV_SECRET', 'obligatorio con AUTH_MODE=dev');
    } else {
      if (!c.OIDC_ISSUER) falta('OIDC_ISSUER', 'obligatorio con AUTH_MODE=oidc');
      if (!c.OIDC_AUDIENCE) falta('OIDC_AUDIENCE', 'obligatorio con AUTH_MODE=oidc');
      if (!c.OIDC_JWKS_URI) falta('OIDC_JWKS_URI', 'obligatorio con AUTH_MODE=oidc');
    }
  });

export type Config = z.infer<typeof esquema>;

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  return r.data;
}
