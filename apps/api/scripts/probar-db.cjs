#!/usr/bin/env node
// Diagnóstico de conexión a la base. Uso (desde la raíz):  npm run db:probar -w @bisa/api
// Lee apps/api/.env, intenta conectar y dice qué falla SIN mostrar la contraseña.
const { Client } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) { console.error('✘ No hay DATABASE_URL: ¿existe apps/api/.env y está bien escrito el nombre de la variable?'); process.exit(1); }

let u;
try { u = new URL(url); } catch { console.error('✘ DATABASE_URL no es una URL válida. Si la clave tiene símbolos (@ # / : %), cámbiela por una solo con letras y números.'); process.exit(1); }
console.log('Usuario :', decodeURIComponent(u.username));
console.log('Servidor:', u.hostname + ':' + (u.port || '5432'));
console.log('Base    :', u.pathname.slice(1));
console.log('Clave   :', u.password ? `(${decodeURIComponent(u.password).length} caracteres)` : '✘ VACÍA');
console.log('DB_SSL  :', process.env.DB_SSL ?? '(no definida → off)');

const modo = process.env.DB_SSL ?? 'off';
const limpia = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
const c = new Client({ connectionString: limpia, ssl: modo === 'off' ? false : { rejectUnauthorized: modo === 'verify' }, connectionTimeoutMillis: 10000 });

const PISTAS = {
  ENOTFOUND: 'El servidor no existe: revise la región/host en DATABASE_URL (copie la cadena del Session pooler).',
  ECONNREFUSED: 'Nadie escucha en ese servidor/puerto: use el puerto 5432 del Session pooler.',
  ETIMEDOUT: 'No hubo respuesta (red, firewall o conexión directa solo IPv6): use el Session pooler.',
  '28P01': 'Usuario o clave incorrectos. Con Supabase el usuario es cotizador_app.SU_REF y la clave es APP_DB_PASSWORD (no la de la base).',
  '3D000': 'La base no existe: normalmente es «postgres».',
  XX000: 'Supabase no reconoce el proyecto: revise el REF en el usuario (cotizador_app.REF) y la región del servidor.',
};
(async () => {
  try {
    await c.connect();
    console.log('✔ Conexión correcta');
    const r = await c.query(`SELECT current_user AS usuario, (SELECT count(*) FROM tarifa) AS tarifas, (SELECT count(*) FROM usuario) AS usuarios`);
    console.log('✔ Consulta correcta:', r.rows[0]);
  } catch (e) {
    console.error('\n✘ Falló:', e.code ?? '', e.message);
    const pista = PISTAS[e.code] ?? (/SSL|certificate/i.test(e.message) ? 'Problema de certificado: ponga DB_SSL=no-verify en apps/api/.env.' : /Tenant or user not found/i.test(e.message) ? PISTAS.XX000 : /does not exist/i.test(e.message) && /relation/.test(e.message) ? 'Falta preparar la base: ejecute desplegar-db.cjs (o no usó el usuario cotizador_app).' : '');
    if (pista) console.error('→', pista);
    process.exitCode = 1;
  } finally { await c.end().catch(() => {}); }
})();
