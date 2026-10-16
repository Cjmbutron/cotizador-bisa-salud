#!/usr/bin/env node
// Prepara una base PostgreSQL VACÍA (Neon, Railway, Supabase...) para el cotizador. Se ejecuta UNA vez.
//   ADMIN_DATABASE_URL=postgres://dueño:clave@host/db  APP_DB_PASSWORD='clave-larga'  \
//   USUARIOS_INICIALES='ana@bisa.com=COMERCIAL,rev@bisa.com=REVISOR_COMERCIAL+ADMIN_TARIFAS'  node apps/api/scripts/desplegar-db.cjs
// Hace: 1) aplica los scripts de /db  2) crea el rol de aplicación SIN permisos de DDL  3) da de alta a los usuarios
//       4) publica el tarifario inicial con dos usuarios de sistema (inactivos), porque la base exige creador ≠ aprobador.
// La API debe conectarse con el rol "cotizador_app", nunca con el dueño.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');

const ROLES = ['COMERCIAL', 'SUPERVISOR', 'ADMIN_TARIFAS', 'APROBADOR_TARIFAS', 'AUDITOR', 'ADMIN_TI', 'REVISOR_COMERCIAL'];
const url = process.env.ADMIN_DATABASE_URL;
const claveApp = process.env.APP_DB_PASSWORD;
if (!url || !claveApp || claveApp.length < 16) { console.error('Faltan ADMIN_DATABASE_URL o APP_DB_PASSWORD (mínimo 16 caracteres).'); process.exit(1); }
if (/[^A-Za-z0-9_\-.~]/.test(claveApp)) { console.error('APP_DB_PASSWORD solo puede llevar letras, números y _ - . ~ (para ir sin problemas dentro de una URL).'); process.exit(1); }

const usuarios = (process.env.USUARIOS_INICIALES ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const [correo, r = ''] = x.split('=');
  const roles = r.split('+').filter(Boolean);
  if (!correo.includes('@') || !roles.length || roles.some((y) => !ROLES.includes(y))) { console.error(`Usuario inválido: «${x}». Roles posibles: ${ROLES.join(', ')}`); process.exit(1); }
  return { correo: correo.toLowerCase(), roles };
});
if (!usuarios.length) { console.error('Indique USUARIOS_INICIALES (al menos un usuario).'); process.exit(1); }

(async () => {
  // ADMIN_SSL: off (local) | no-verify (Supabase: su certificado es de una autoridad propia) | verify. Por omisión: off en localhost, no-verify en el resto.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const modo = process.env.ADMIN_SSL ?? (local ? 'off' : 'no-verify');
  const limpia = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  const db = new Client({ connectionString: limpia, ssl: modo === 'off' ? false : { rejectUnauthorized: modo === 'verify' } });
  await db.connect();
  const ya = await db.query(`SELECT to_regclass('public.usuario') AS t`);
  if (ya.rows[0].t) { console.error('La base ya tiene el esquema. Este script solo sirve para una base vacía.'); process.exit(1); }

  const dir = join(__dirname, '..', '..', '..', 'db');
  for (const f of ['01_schema', '02_catalogos', '03_planes_y_tarifas', '04_parametros', '06_documentos']) {
    await db.query(readFileSync(join(dir, `${f}.sql`), 'utf8'));
    console.log(`✔ ${f}.sql`);
  }

  await db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cotizador_app') THEN CREATE ROLE cotizador_app LOGIN; END IF; END $$`);
  await db.query(`ALTER ROLE cotizador_app PASSWORD '${claveApp}'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO cotizador_app`);
  await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cotizador_app`);
  await db.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cotizador_app`);
  console.log('✔ rol cotizador_app creado (sin DDL)');

  // Supabase: cierra la API REST pública sobre nuestras tablas (RLS + revocar anon/authenticated). Ver db/07_supabase.sql.
  await db.query(readFileSync(join(dir, '07_supabase.sql'), 'utf8'));
  console.log('✔ 07_supabase.sql (RLS activado, anon/authenticated sin acceso)');

  for (const u of usuarios) {
    const r = await db.query(`INSERT INTO usuario (email, nombre) VALUES ($1,$2) RETURNING id`, [u.correo, u.correo.split('@')[0]]);
    for (const rol of u.roles) await db.query(`INSERT INTO usuario_rol SELECT $1, id FROM rol WHERE codigo = $2`, [r.rows[0].id, rol]);
    console.log(`✔ usuario ${u.correo}: ${u.roles.join(', ')}`);
  }

  // Usuarios de sistema, inactivos: no pueden iniciar sesión. Solo dejan constancia de quién cargó y quién publicó la versión inicial.
  const c = await db.query(`INSERT INTO usuario (email, nombre, activo) VALUES ('carga-inicial@sistema.local','Carga inicial',false) RETURNING id`);
  const a = await db.query(`INSERT INTO usuario (email, nombre, activo) VALUES ('publicacion-inicial@sistema.local','Publicación inicial',false) RETURNING id`);
  const p = await db.query(
    `UPDATE version_tarifa SET creado_por=$1, aprobado_por=$2, aprobado_en=now(), estado='PUBLICADA'
      WHERE estado='BORRADOR' AND creado_por IS NULL RETURNING nombre`, [c.rows[0].id, a.rows[0].id]);
  console.log(`✔ tarifario publicado: ${p.rows.map((x) => x.nombre).join(', ')}`);
  console.log('\nListo. DATABASE_URL de la API: reemplace usuario y clave por cotizador_app / APP_DB_PASSWORD.');
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
