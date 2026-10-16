import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { USUARIOS, URL_DB, entradaBase, iniciarApp, sembrar, token } from './ayudas';

const CHROMIUM = process.env.CHROMIUM_PATH;

/** Texto de un PDF, para comprobar contenido sin depender de cómo se pagina. */
function textoDe(pdf: Buffer): string {
  const f = join(mkdtempSync(join(tmpdir(), 'pdf-')), 'p.pdf');
  writeFileSync(f, pdf);
  return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
}
const binario = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const trozos: Buffer[] = [];
  res.on('data', (t: Buffer) => trozos.push(t));
  res.on('end', () => cb(null, Buffer.concat(trozos)));
};

describe('Propuestas en PDF', () => {
  let app: INestApplication; let pool: Pool;
  let ana = ''; let beto = ''; let sup = ''; let aud = ''; let revisor = ''; let admin = '';
  const http = () => request(app.getHttpServer());
  const con = (t: string) => ({ Authorization: `Bearer ${t}` });
  const pdf = (id: string, prod: string, t: string) =>
    http().post(`/cotizaciones/${id}/documentos/${prod}`).set(con(t)).buffer(true).parse(binario);

  const guardar = async (titularNombre: string, entrada: object) =>
    (await http().post('/cotizaciones').set(con(ana)).send({ titularNombre, entrada }).expect(201)).body.id as string;

  let idSM = ''; let idCM = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_DB });
    await sembrar(pool);
    app = await iniciarApp(CHROMIUM ? { CHROMIUM_PATH: CHROMIUM, CHROMIUM_SIN_SANDBOX: 'true' } : {});
    ana = await token(USUARIOS.ana.email); beto = await token(USUARIOS.beto.email); sup = await token(USUARIOS.sup.email);
    aud = await token(USUARIOS.aud.email); revisor = await token(USUARIOS.revisor.email); admin = await token(USUARIOS.creador.email);
    idSM = await guardar('Jorge Vargas', entradaBase());
    idCM = await guardar('María Pérez', {
      ...entradaBase(), productos: ['IG', 'RM'], redMax: { plan: 'RM_700K' },
      asegurados: [{ parentesco: 'TITULAR', edad: 30, sexo: 'FEMENINO_CON_MATERNIDAD' }],
    });
  }, 60_000);
  afterAll(async () => { await app.close(); await pool.end(); });

  describe('permisos y estados', () => {
    it('sin token → 401', () => http().post(`/cotizaciones/${idSM}/documentos/IG`).expect(401));
    it('un usuario sin rol de cotización no genera propuestas → 403', async () =>
      http().post(`/cotizaciones/${idSM}/documentos/IG`).set(con(admin)).expect(403));
    it('otro comercial no ve la cotización de Ana → 404', () => pdf(idSM, 'IG', beto).expect(404));
    it('un producto que no se cotizó → 422', async () => {
      const r = await http().post(`/cotizaciones/${idSM}/documentos/NP`).set(con(ana)).expect(422);
      expect(r.body.codigo).toBe('PRODUCTO_NO_COTIZADO');
    });
    it('supervisor y auditor pueden consultar el historial de documentos', async () => {
      await http().get(`/cotizaciones/${idSM}/documentos`).set(con(sup)).expect(200);
      await http().get(`/cotizaciones/${idSM}/documentos`).set(con(aud)).expect(200);
    });
    it('revisión de plantillas: solo REVISOR_COMERCIAL aprueba', async () => {
      await http().get('/admin/plantillas').set(con(ana)).expect(403);
      await http().post('/admin/plantillas/x/aprobar').set(con(aud)).expect(403);
      await http().post('/admin/plantillas/x/aprobar').set(con(admin)).expect(403);
    });
  });

  (CHROMIUM ? describe : describe.skip)('generación (requiere Chromium: defina CHROMIUM_PATH)', () => {
    it('Infinity sin maternidad: PDF válido con la nómina y totales del motor, marcado como provisional', async () => {
      const r = await pdf(idSM, 'IG', ana).expect(200);
      const buf = r.body as Buffer;
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.headers['x-texto-provisional']).toBe('true');
      expect(decodeURIComponent(r.headers['x-archivo']!)).toBe('Jorge Vargas - Infinity Green.pdf');
      expect(r.headers['x-hash-sha256']).toMatch(/^[0-9a-f]{64}$/);
      const t = textoDe(buf);
      expect(t).toContain('Jorge Vargas');
      expect(t).toContain('TITULAR');
      expect(t).toContain('PENDIENTE DE REVISIÓN COMERCIAL');
      expect(t).toContain('10 días hábiles');
      expect(t).not.toMatch(/#VALUE|#REF|#NAME|NaN|undefined/);
    }, 60_000);

    it('con maternidad se usa la plantilla CM y el nombre lo indica', async () => {
      const r = await pdf(idCM, 'IG', ana).expect(200);
      expect(decodeURIComponent(r.headers['x-archivo']!)).toBe('María Pérez - Infinity Green CON MATERNIDAD.pdf');
      const t = textoDe(r.body as Buffer);
      expect(t).toContain('MATERNIDAD');
      expect(t).toContain('CESÁREA');
      expect(t).not.toMatch(/#VALUE|#REF|#NAME|NaN|undefined/);
    }, 60_000);

    it('Red Max usa moneda Bs. y su propia plantilla', async () => {
      const r = await pdf(idCM, 'RM', ana).expect(200);
      expect(decodeURIComponent(r.headers['x-archivo']!)).toBe('María Pérez - Red Max CON MATERNIDAD.pdf');
      expect(textoDe(r.body as Buffer)).toMatch(/Bs/);
    }, 60_000);

    it('cada generación queda registrada con su hash y en la auditoría', async () => {
      const h = await http().get(`/cotizaciones/${idSM}/documentos`).set(con(ana)).expect(200);
      expect(h.body.length).toBeGreaterThan(0);
      expect(h.body[0]).toMatchObject({ archivo: 'Jorge Vargas - Infinity Green.pdf', generadoPor: 'ana@bisa.test', plantilla: 'IG_SM' });
      const a = await pool.query(`SELECT count(*)::int n FROM auditoria WHERE accion = 'DOCUMENTO_GENERAR' AND entidad_id = $1`, [idSM]);
      expect(a.rows[0].n).toBeGreaterThan(0);
    });

    it('una cotización anulada ya no genera propuesta → 409', async () => {
      const id = await guardar('Anulada Prueba', entradaBase());
      await http().post(`/cotizaciones/${id}/anular`).set(con(ana)).send({ motivo: 'prueba' }).expect(200);
      await pdf(id, 'IG', ana).expect(409);
    }, 60_000);

    it('al aprobar el texto, el PDF sale sin marca; si el contenido cambia, la aprobación caduca', async () => {
      const lista = (await http().get('/admin/plantillas').set(con(revisor)).expect(200)).body as { id: string; clave: string; textoAprobado: boolean }[];
      expect(lista).toHaveLength(13);
      expect(lista.every((p) => !p.textoAprobado)).toBe(true);
      const ig = lista.find((p) => p.clave === 'IG_SM')!;
      await http().post(`/admin/plantillas/${ig.id}/aprobar`).set(con(revisor)).expect(200);

      const r = await pdf(idSM, 'IG', ana).expect(200);
      expect(r.headers['x-texto-provisional']).toBe('false');
      expect(textoDe(r.body as Buffer)).not.toContain('PENDIENTE DE REVISIÓN COMERCIAL');

      // Simula un cambio del contenido aprobado: la aprobación guardada ya no coincide con el archivo.
      await pool.query(`UPDATE plantilla_documento SET hash_aprobado = repeat('0', 64) WHERE id = $1`, [ig.id]);
      const r2 = await pdf(idSM, 'IG', ana).expect(200);
      expect(r2.headers['x-texto-provisional']).toBe('true');
      const l2 = (await http().get('/admin/plantillas').set(con(revisor))).body as { clave: string; aprobacionCaducada: boolean }[];
      expect(l2.find((p) => p.clave === 'IG_SM')!.aprobacionCaducada).toBe(true);

      await http().post(`/admin/plantillas/${ig.id}/revocar`).set(con(revisor)).expect(200);
      const l3 = (await http().get('/admin/plantillas').set(con(revisor))).body as { clave: string; textoAprobado: boolean }[];
      expect(l3.find((p) => p.clave === 'IG_SM')!.textoAprobado).toBe(false);
    }, 90_000);
  });
});
