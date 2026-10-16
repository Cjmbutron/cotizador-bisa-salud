import { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { crearApp } from '../src/app';
import { Config, cargarConfig } from '../src/config/config';

export const SECRETO = 'secreto-solo-para-pruebas-0123456789abcdef';
export const URL_DB = process.env.TEST_DATABASE_URL ?? 'postgres://cotizador_app:test@127.0.0.1:5432/cotizador_test';

export function configPrueba(extra: Record<string, string> = {}): Config {
  return cargarConfig({
    NODE_ENV: 'test', DATABASE_URL: URL_DB, AUTH_MODE: 'dev', AUTH_DEV_SECRET: SECRETO,
    RATE_LIMIT_POR_MINUTO: '10000', ...extra,
  } as NodeJS.ProcessEnv);
}

export const iniciarApp = (extra: Record<string, string> = {}): Promise<INestApplication> =>
  crearApp(configPrueba(extra), { logger: false }).then(async (a) => (await a.init(), a));

export async function token(email: string, opts: { issuer?: string; secreto?: string; exp?: string } = {}) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.issuer ?? 'cotizador-dev')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(new TextEncoder().encode(opts.secreto ?? SECRETO));
}

export const USUARIOS = {
  ana: { email: 'ana@bisa.test', roles: ['COMERCIAL'], activo: true },
  beto: { email: 'beto@bisa.test', roles: ['COMERCIAL'], activo: true },
  sup: { email: 'sup@bisa.test', roles: ['SUPERVISOR'], activo: true },
  aud: { email: 'aud@bisa.test', roles: ['AUDITOR'], activo: true },
  inactivo: { email: 'inactivo@bisa.test', roles: ['COMERCIAL'], activo: false },
  sinrol: { email: 'sinrol@bisa.test', roles: [] as string[], activo: true },
  creador: { email: 'creador@bisa.test', roles: ['ADMIN_TARIFAS'], activo: true },
  doble: { email: 'doble@bisa.test', roles: ['ADMIN_TARIFAS', 'APROBADOR_TARIFAS'], activo: true },
  revisor: { email: 'revisor@bisa.test', roles: ['REVISOR_COMERCIAL'], activo: true },
  aprobador: { email: 'aprobador@bisa.test', roles: ['APROBADOR_TARIFAS'], activo: true },
} as const;

/** Crea usuarios y publica el tarifario cargado (creador y aprobador distintos, como exige la base). */
export async function sembrar(pool: Pool) {
  for (const u of Object.values(USUARIOS)) {
    const r = await pool.query(
      `INSERT INTO usuario (email, nombre, activo) VALUES ($1,$2,$3)
       ON CONFLICT (lower(email)) DO UPDATE SET activo = EXCLUDED.activo RETURNING id`,
      [u.email, u.email.split('@')[0], u.activo],
    );
    for (const rol of u.roles) {
      await pool.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id) SELECT $1, id FROM rol WHERE codigo = $2 ON CONFLICT DO NOTHING`,
        [r.rows[0].id, rol],
      );
    }
  }
  await pool.query(
    `UPDATE version_tarifa SET
        creado_por = (SELECT id FROM usuario WHERE email = $1),
        aprobado_por = (SELECT id FROM usuario WHERE email = $2),
        aprobado_en = now(), estado = 'PUBLICADA'
      WHERE nombre = 'Tarifario 2026-05' AND estado = 'BORRADOR'`,
    [USUARIOS.creador.email, USUARIOS.aprobador.email],
  );
}

export const entradaBase = () => ({
  regional: 'LPZ',
  aplicaSars: false,
  productos: ['IG', 'AD'],
  asegurados: [
    { parentesco: 'TITULAR', edad: 30, sexo: 'MASCULINO' },
    { parentesco: 'CONYUGE', edad: 28, sexo: 'FEMENINO_SIN_MATERNIDAD' },
  ],
});
