import type { PoolConfig } from 'pg';

export type ModoSsl = 'off' | 'no-verify' | 'verify';

/**
 * Conexión TLS a la base. Supabase firma sus certificados con una autoridad propia que Node no conoce:
 *  - no-verify: cifra pero no valida la cadena (suficiente para el MVP; Supabase solo acepta TLS desde su pooler).
 *  - verify: valida contra las autoridades públicas, o contra `ca` si se entrega el certificado raíz (PEM).
 * Se quita "sslmode" de la URL porque pg lo interpretaría por su cuenta y pisaría esta configuración.
 */
export function configSsl(url: string, modo: ModoSsl, ca?: string): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  const limpia = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  if (modo === 'off') return { connectionString: limpia, ssl: false };
  if (modo === 'no-verify') return { connectionString: limpia, ssl: { rejectUnauthorized: false } };
  return { connectionString: limpia, ssl: { rejectUnauthorized: true, ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}) } };
}
