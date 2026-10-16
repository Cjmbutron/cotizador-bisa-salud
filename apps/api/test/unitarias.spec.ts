import { sumarDiasHabiles } from '../src/comun/fechas';
import { cargarConfig } from '../src/config/config';

describe('sumarDiasHabiles', () => {
  it('10 días hábiles desde un lunes caen dos semanas después', () => {
    expect(sumarDiasHabiles('2026-10-05', 10)).toBe('2026-10-19');
  });
  it('desde un viernes, 1 día hábil es el lunes', () => {
    expect(sumarDiasHabiles('2026-10-09', 1)).toBe('2026-10-12');
  });
  it('desde un sábado, 1 día hábil es el lunes', () => {
    expect(sumarDiasHabiles('2026-10-10', 1)).toBe('2026-10-12');
  });
  it('cruza fin de año', () => {
    expect(sumarDiasHabiles('2026-12-30', 3)).toBe('2027-01-04');
  });
});

describe('configuración', () => {
  const base = { DATABASE_URL: 'postgres://x' };
  it('exige datos del proveedor de identidad en modo oidc', () => {
    expect(() => cargarConfig({ ...base } as NodeJS.ProcessEnv)).toThrow(/OIDC_ISSUER/);
  });
  it('prohíbe el modo dev en producción', () => {
    expect(() => cargarConfig({ ...base, NODE_ENV: 'production', AUTH_MODE: 'dev', AUTH_DEV_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv)).toThrow(/prohibido en producción/);
  });
  it('rechaza un secreto de desarrollo corto', () => {
    expect(() => cargarConfig({ ...base, AUTH_MODE: 'dev', AUTH_DEV_SECRET: 'corto' } as NodeJS.ProcessEnv)).toThrow(/32 caracteres/);
  });
  it('acepta oidc completo', () => {
    const c = cargarConfig({ ...base, OIDC_ISSUER: 'https://idp', OIDC_AUDIENCE: 'api', OIDC_JWKS_URI: 'https://idp/jwks' } as NodeJS.ProcessEnv);
    expect(c.AUTH_MODE).toBe('oidc');
  });
});
