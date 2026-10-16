// Prueba de extremo a extremo en un Chromium real: asistente completo, guardar, emitir y listar.
// Requiere la API (puerto 3000) y la web en modo desarrollo (puerto 3001) con AUTH_MODE=dev.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const BASE = process.env.WEB_URL ?? 'http://127.0.0.1:3001';
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pag = await (await navegador.newContext({ locale: 'es-BO' })).newPage();
const errores = [];
await pag.addInitScript(() => {
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__ultimaDescarga = this.download; return click.call(this); };
});
pag.on('pageerror', (e) => errores.push(e.message));
pag.on('console', (m) => m.type() === 'error' && !/favicon|404|403/.test(m.text()) && errores.push(m.text()));

try {
  // Acceso sin sesión → login
  await pag.goto(`${BASE}/cotizar`);
  await pag.waitForURL('**/login');
  // Usuario sin acceso
  await pag.fill('#correo', 'nadie@bisa.test'); await pag.click('button:has-text("Entrar")');
  await pag.getByText('no tiene acceso').waitFor();
  // Usuario válido
  await pag.fill('#correo', 'ana@bisa.test'); await pag.click('button:has-text("Entrar")');
  await pag.waitForURL('**/cotizar'); await pag.getByRole('heading', { name: 'Nueva cotización' }).waitFor();

  // Paso 1: sin nombre no avanza
  await pag.click('button:has-text("Siguiente")');
  await pag.getByText('Escriba el nombre del titular').waitFor();
  await pag.fill('#nombre', 'Juan Pérez'); await pag.click('button:has-text("Siguiente")');
  // Paso 2: productos
  await pag.click('button:has-text("Siguiente")'); await pag.getByText('Seleccione al menos un producto').waitFor();
  for (const n of ['Infinity Green', 'Advance', 'Mundial Blue']) await pag.getByLabel(new RegExp(n)).check();
  await pag.click('button:has-text("Siguiente")');
  // Paso 3: asegurados
  await pag.fill('#edad0', '30');
  await pag.click('button:has-text("+ Cónyuge")'); await pag.fill('#edad1', '28'); await pag.selectOption('#sexo1', 'FEMENINO_SIN_MATERNIDAD');
  await pag.click('button:has-text("+ Dependiente")'); await pag.fill('#edad2', '5');
  assert.equal(await pag.locator('#sexo2 option[value="FEMENINO_CON_MATERNIDAD"]').count(), 0, 'un dependiente no admite maternidad');
  await pag.click('button:has-text("Siguiente")');
  // Paso 4: Mundial Blue necesita número de hijos
  await pag.click('button:has-text("Calcular")'); await pag.getByText('Indique el número de hijos').waitFor();
  await pag.click('button:has-text("Usar 1")'); await pag.click('button:has-text("Calcular")');
  // Paso 5: resultado
  await pag.getByRole('heading', { name: 'Totales por producto' }).waitFor();
  const ig = pag.getByRole('region', { name: 'Infinity Green' });
  assert.match(await ig.innerText(), /USD/);
  if (process.env.CAPTURA) await pag.screenshot({ path: process.env.CAPTURA, fullPage: true });
  const filas = await pag.locator('tbody tr').allInnerTexts();
  assert.equal(filas.length, 3);
  assert.match(filas[0], /Titular · 30 años/); assert.match(filas[0], /USD 66/); // Infinity, hombre 30, LPZ = 66 como en el Excel
  await pag.locator('details summary').first().click();
  await pag.getByText('Tarifa LPZ edad 30').first().waitFor();
  // Paso 6: guardar
  await pag.click('button:has-text("Continuar")');
  await pag.click('button:has-text("Guardar cotización")');
  const ok = await pag.getByRole('status').innerText();
  const numero = /COT-\d{4}-\d{6}/.exec(ok)?.[0]; assert.ok(numero, 'número de cotización');
  await pag.click('a:has-text("Ver cotización")');
  await pag.getByRole('heading', { name: new RegExp(numero) }).waitFor();
  // Emitir
  await pag.click('button:has-text("Emitir cotización")');
  await pag.locator('.insignia.EMITIDA').first().waitFor();
  assert.equal(await pag.locator('button:has-text("Emitir cotización")').count(), 0);
  // Propuesta en PDF: descarga real, nombre según la regla y aviso de texto provisional
  const [descarga] = await Promise.all([pag.waitForEvent('download'), pag.click('button:has-text("Descargar Infinity Green")')]);
  // El Chromium sin interfaz devuelve «download» cuando el nombre lleva tildes; se comprueba el nombre que la página le pone al enlace.
  assert.equal(await pag.evaluate(() => window.__ultimaDescarga), 'Juan Pérez - Infinity Green.pdf');
  const ruta = await descarga.path();
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(ruta).subarray(0, 5).toString(), '%PDF-');
  await pag.getByText('TEXTO PROVISIONAL').first().waitFor();
  // Anular exige motivo
  await pag.click('button:has-text("Anular")');
  assert.equal(await pag.locator('button:has-text("Confirmar anulación")').isDisabled(), true);
  await pag.fill('#motivo', 'Error de digitación'); await pag.click('button:has-text("Confirmar anulación")');
  await pag.locator('.insignia.ANULADA').first().waitFor();
  // Listado y búsqueda
  await pag.click('nav >> text=Cotizaciones');
  await pag.fill('#q', 'juan'); await pag.getByRole('link', { name: numero }).waitFor();
  await pag.fill('#q', 'zzzz'); await pag.getByText('No hay cotizaciones con esos filtros').waitFor();
  // Salir
  await pag.click('button:has-text("Salir")'); await pag.waitForURL('**/login');
  assert.deepEqual(errores, [], 'sin errores en consola');
  console.log('E2E OK', numero);
} catch (e) {
  await pag.screenshot({ path: '/tmp/e2e-fallo.png', fullPage: true }).catch(() => {});
  console.error(e); process.exitCode = 1;
} finally { await navegador.close(); }
