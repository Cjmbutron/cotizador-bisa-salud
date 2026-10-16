// Administración de tarifas en un Chromium real: crear versión, importar CSV, revisión, separación de funciones, publicar y parámetros.
// Requiere API (3000) + web en desarrollo (3001), AUTH_MODE=dev, y `node apps/api/scripts/sembrar-dev.cjs` sobre una base recién creada.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const BASE = process.env.WEB_URL ?? 'http://127.0.0.1:3001';
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const nombre = `Tarifario E2E ${Date.now()}`;
const FUTURO = '2027-05-01';

async function sesion(correo) {
  const ctx = await navegador.newContext({ locale: 'es-BO' }); const pag = await ctx.newPage();
  await pag.goto(`${BASE}/login`); await pag.fill('#correo', correo); await pag.click('button:has-text("Entrar")');
  await pag.waitForURL((u) => !u.pathname.startsWith('/login')); return pag;
}

try {
  // Un comercial no ve la administración
  const ana = await sesion('ana@bisa.test'); await ana.waitForURL('**/cotizar');
  assert.equal(await ana.locator('nav >> text=Tarifas').count(), 0);
  await ana.goto(`${BASE}/admin/tarifas`); await ana.getByText('No tiene acceso').waitFor();

  // El administrador crea una versión copiando la vigente
  const adm = await sesion('creador@bisa.test'); await adm.waitForURL('**/admin/tarifas');
  await adm.click('button:has-text("Nueva versión")');
  await adm.fill('#n', nombre); await adm.fill('#d', FUTURO); await adm.selectOption('#c', { index: 1 }); await adm.fill('#r', 'Oficio E2E 001/2027');
  await adm.click('button:has-text("Crear borrador")'); await adm.getByRole('heading', { name: new RegExp(nombre) }).waitFor();
  await adm.getByText('La versión está completa').waitFor();

  // Importar un CSV con un cambio y un error (todo o nada)
  await adm.fill('#csv', 'plan,region,sexo,edad,prima\nIG,LPZ,M,30,70\nXX,,,1,1');
  await adm.click('button:has-text("Importar")'); await adm.getByRole('alert').getByText(/plan inexistente/).waitFor();
  await adm.fill('#csv', 'plan,region,sexo,edad,prima\nIG,LPZ,M,30,70\nIG,LPZ,M,40,N/A');
  await adm.click('button:has-text("Importar")'); await adm.getByRole('status').getByText('Se guardaron 2 filas').waitFor();
  await adm.getByRole('cell', { name: 'IG', exact: true }).first().waitFor();       // aparece en la comparación
  await adm.getByText(/6\.06% a 6\.06%/).first().waitFor();  // (70-66)/66

  // Envía a revisión; ya no se edita
  await adm.click('button:has-text("Enviar a revisión")'); await adm.getByText('Enviada a revisión').waitFor();
  assert.equal(await adm.locator('button:has-text("Importar")').count(), 0);
  const url = adm.url();

  // El aprobador: ve los cambios y publica
  const apr = await sesion('aprobador@bisa.test'); await apr.goto(url);
  await apr.getByRole('heading', { name: new RegExp(nombre) }).waitFor();
  await apr.click('button:has-text("Devolver")'); assert.equal(await apr.locator('button:has-text("Confirmar devolución")').isDisabled(), true);
  await apr.click('button:has-text("Cancelar")');
  await apr.click('button:has-text("Publicar")'); await apr.getByText('Versión publicada').waitFor();
  await apr.locator('.insignia.OK').first().waitFor();

  // Parámetros: el administrador programa un cambio
  await adm.goto(`${BASE}/admin/parametros`);
  await adm.locator('tr', { hasText: 'SARS_RECARGO' }).filter({ hasText: 'IG' }).getByRole('button', { name: 'Cambiar' }).click();
  await adm.fill('#v', '12'); await adm.fill('#d', FUTURO); await adm.fill('#m', 'Ajuste E2E');
  await adm.click('button:has-text("Programar cambio")'); await adm.getByText('Parámetro programado').waitFor();
  await adm.getByLabel('Ver también valores anteriores').check();
  await adm.locator('tr', { hasText: 'SARS_RECARGO' }).filter({ hasText: FUTURO }).first().waitFor();
  console.log('E2E ADMIN OK', nombre);
} catch (e) { console.error(e); process.exitCode = 1; } finally { await navegador.close(); }
