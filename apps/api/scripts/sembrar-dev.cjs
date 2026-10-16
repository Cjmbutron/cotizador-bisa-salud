#!/usr/bin/env node
// SOLO DESARROLLO/PRUEBAS: crea usuarios de ejemplo con sus roles y publica el tarifario cargado (creador ≠ aprobador).
//   DATABASE_URL=postgres://... node scripts/sembrar-dev.cjs
const { Pool } = require('pg');
if (process.env.NODE_ENV === 'production') { console.error('Prohibido en producción'); process.exit(1); }
const USUARIOS = {
  'ana@bisa.test': ['COMERCIAL'], 'sup@bisa.test': ['SUPERVISOR'], 'creador@bisa.test': ['ADMIN_TARIFAS'],
  'aprobador@bisa.test': ['APROBADOR_TARIFAS'], 'auditor@bisa.test': ['AUDITOR'], 'revisor@bisa.test': ['REVISOR_COMERCIAL'],
};
(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const [email, roles] of Object.entries(USUARIOS)) {
    const u = await p.query(`INSERT INTO usuario (email, nombre) VALUES ($1,$2) ON CONFLICT (lower(email)) DO UPDATE SET activo = true RETURNING id`, [email, email.split('@')[0]]);
    for (const r of roles) await p.query(`INSERT INTO usuario_rol SELECT $1, id FROM rol WHERE codigo = $2 ON CONFLICT DO NOTHING`, [u.rows[0].id, r]);
  }
  await p.query(`UPDATE version_tarifa SET creado_por = (SELECT id FROM usuario WHERE email = 'creador@bisa.test'),
      aprobado_por = (SELECT id FROM usuario WHERE email = 'aprobador@bisa.test'), aprobado_en = now(), estado = 'PUBLICADA'
    WHERE estado = 'BORRADOR' AND creado_por IS NULL`);
  console.log('Usuarios de ejemplo listos:', Object.keys(USUARIOS).join(', '));
  await p.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
