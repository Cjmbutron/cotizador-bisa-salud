#!/usr/bin/env node
// Genera un token de desarrollo (AUTH_MODE=dev) para probar la API a mano:
//   AUTH_DEV_SECRET=... node scripts/token-dev.cjs ana@bisa.test
const { SignJWT } = require('jose');
if (process.env.NODE_ENV === 'production') { console.error('Prohibido en producción'); process.exit(1); }
const [email] = process.argv.slice(2);
const secreto = process.env.AUTH_DEV_SECRET;
if (!email || !secreto || secreto.length < 32) {
  console.error('Uso: AUTH_DEV_SECRET=<mín. 32 caracteres> node scripts/token-dev.cjs correo@dominio');
  process.exit(1);
}
new SignJWT({ email }).setProtectedHeader({ alg: 'HS256' }).setIssuer('cotizador-dev').setIssuedAt().setExpirationTime('8h')
  .sign(new TextEncoder().encode(secreto)).then(console.log);
