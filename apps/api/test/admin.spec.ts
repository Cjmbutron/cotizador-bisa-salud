import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { TarifasService } from '../src/tarifas/tarifas.service';
import { USUARIOS, URL_DB, iniciarApp, sembrar, token } from './ayudas';

const FUTURO = '2027-03-01';

describe('Administración de tarifas y parámetros', () => {
  let app: INestApplication; let pool: Pool;
  let ana = ''; let creador = ''; let aprobador = ''; let doble = ''; let aud = '';
  const http = () => request(app.getHttpServer());
  const con = (t: string) => ({ Authorization: `Bearer ${t}` });
  const nombre = `Tarifario prueba ${Date.now()}`;
  let id = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_DB });
    await sembrar(pool);
    app = await iniciarApp();
    ana = await token(USUARIOS.ana.email); creador = await token(USUARIOS.creador.email);
    aprobador = await token(USUARIOS.aprobador.email); doble = await token(USUARIOS.doble.email); aud = await token(USUARIOS.aud.email);
  });
  afterAll(async () => { await app.close(); await pool.end(); });

  const vigenteId = async () => (await pool.query(`SELECT id FROM version_tarifa WHERE nombre = 'Tarifario 2026-05'`)).rows[0].id as string;

  describe('permisos', () => {
    it('un comercial no entra a la administración → 403', () => http().get('/admin/tarifas/versiones').set(con(ana)).expect(403));
    it('el aprobador no puede crear versiones → 403', () =>
      http().post('/admin/tarifas/versiones').set(con(aprobador)).send({ nombre: 'x', vigenteDesde: FUTURO, respaldoDocumental: 'oficio' }).expect(403));
    it('el que prepara no puede publicar → 403', () => http().post('/admin/tarifas/versiones/x/publicar').set(con(creador)).expect(403));
    it('el auditor puede consultar pero no editar', async () => {
      await http().get('/admin/tarifas/versiones').set(con(aud)).expect(200);
      await http().post('/admin/parametros').set(con(aud)).send({}).expect(403);
    });
  });

  describe('crear y editar un borrador', () => {
    it('la vigencia debe ser futura', async () => {
      await http().post('/admin/tarifas/versiones').set(con(creador))
        .send({ nombre, vigenteDesde: '2026-01-01', respaldoDocumental: 'Oficio 123' }).expect(422);
    });
    it('crea una versión copiando la vigente', async () => {
      const r = await http().post('/admin/tarifas/versiones').set(con(creador))
        .send({ nombre, vigenteDesde: FUTURO, respaldoDocumental: 'Oficio 123/2027', copiarDe: await vigenteId() }).expect(201);
      id = r.body.id;
      const n = await pool.query(`SELECT (SELECT count(*) FROM tarifa WHERE version_id = $1)::int a, (SELECT count(*) FROM tarifa WHERE version_id = $2)::int b`, [id, await vigenteId()]);
      expect(n.rows[0].a).toBe(n.rows[0].b);
    });
    it('el nombre es único → 409', async () =>
      http().post('/admin/tarifas/versiones').set(con(creador)).send({ nombre, vigenteDesde: FUTURO, respaldoDocumental: 'otro' }).expect(409));

    it('cambia una tarifa y solo esa', async () => {
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador))
        .send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 30, prima: 70 }] }).expect(200);
      const r = await pool.query(`SELECT prima::float8 p FROM v_tarifa_detalle WHERE version_id = $1 AND plan = 'IG' AND region = 'LPZ' AND sexo = 'M' AND edad_desde = 30`, [id]);
      expect(r.rows).toEqual([{ p: 70 }]);
      const total = await pool.query(`SELECT count(*)::int n FROM tarifa WHERE version_id = $1 AND plan_id = (SELECT id FROM plan WHERE codigo = 'IG')`, [id]);
      expect(total.rows[0].n).toBe(1500);
    });
    it('una edad puede quedar sin tarifa (N/A)', async () => {
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador))
        .send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 40, prima: null }] }).expect(200);
      const r = await pool.query(`SELECT disponible FROM v_tarifa_detalle WHERE version_id = $1 AND plan = 'IG' AND region = 'LPZ' AND sexo = 'M' AND edad_desde = 40`, [id]);
      expect(r.rows[0].disponible).toBe(false);
    });

    it.each([
      ['plan inexistente', { plan: 'XX', edad: 1, prima: 1 }],
      ['Red Max 140K no tiene tarifa propia', { plan: 'RM_140K', region: 'LPZ', sexo: 'M', edad: 1, prima: 1 }],
      ['Infinity sin región', { plan: 'IG', sexo: 'M', edad: 1, prima: 1 }],
      ['Mundial Blue con región', { plan: 'MB_1MM_5K', region: 'LPZ', edad: 30, prima: 1 }],
      ['Mundial Blue menor de 18', { plan: 'MB_1MM_5K', edad: 10, prima: 1 }],
      ['Naranja+ sobre 64', { plan: 'NP_L_50K_5K', edad: 70, prima: 1 }],
    ])('rechaza: %s → 422', async (_m, fila) => {
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador)).send({ filas: [fila] }).expect(422);
    });
    it('rechaza primas negativas y edades fuera de rango → 400', async () => {
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador)).send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 1, prima: -5 }] }).expect(400);
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador)).send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 100, prima: 5 }] }).expect(400);
    });
    it('rechaza filas repetidas en el mismo envío → 422', async () => {
      const f = { plan: 'IG', region: 'LPZ', sexo: 'M', edad: 5, prima: 10 };
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador)).send({ filas: [f, f] }).expect(422);
    });
    it('un envío inválido no deja cambios a medias (todo o nada)', async () => {
      const antes = await pool.query(`SELECT prima::float8 p FROM v_tarifa_detalle WHERE version_id = $1 AND plan = 'IG' AND region = 'LPZ' AND sexo = 'M' AND edad_desde = 31`, [id]);
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador))
        .send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 31, prima: 999 }, { plan: 'XX', edad: 1, prima: 1 }] }).expect(422);
      const despues = await pool.query(`SELECT prima::float8 p FROM v_tarifa_detalle WHERE version_id = $1 AND plan = 'IG' AND region = 'LPZ' AND sexo = 'M' AND edad_desde = 31`, [id]);
      expect(despues.rows).toEqual(antes.rows);
    });
    it('tarifa por hijo: solo Mundial Blue', async () => {
      await http().put(`/admin/tarifas/versiones/${id}/tarifas-hijo`).set(con(creador)).send({ filas: [{ plan: 'IG', numeroHijos: 1, primaPorHijo: 5 }] }).expect(422);
      await http().put(`/admin/tarifas/versiones/${id}/tarifas-hijo`).set(con(creador)).send({ filas: [{ plan: 'MB_1MM_5K', numeroHijos: 2, primaPorHijo: 40 }] }).expect(200);
    });
    it('la versión publicada no se puede editar → 409', async () =>
      http().put(`/admin/tarifas/versiones/${await vigenteId()}/tarifas`).set(con(creador)).send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 30, prima: 1 }] }).expect(409));
  });

  describe('revisión y publicación', () => {
    it('una versión incompleta no pasa a revisión y dice qué falta', async () => {
      const incompleta = (await http().post('/admin/tarifas/versiones').set(con(creador))
        .send({ nombre: `${nombre} vacía`, vigenteDesde: '2027-06-01', respaldoDocumental: 'prueba' }).expect(201)).body.id;
      const r = await http().post(`/admin/tarifas/versiones/${incompleta}/enviar-revision`).set(con(creador)).expect(422);
      expect(r.body.problemas.join(' ')).toMatch(/IG: tiene 0 tarifas/);
      const rev = await http().get(`/admin/tarifas/versiones/${incompleta}/revision`).set(con(creador)).expect(200);
      expect(rev.body.problemas.length).toBeGreaterThanOrEqual(5);
    });
    it('el borrador de pruebas está completo', async () => {
      const r = await http().get(`/admin/tarifas/versiones/${id}/revision`).set(con(creador)).expect(200);
      expect(r.body.problemas).toEqual([]);
    });
    it('solo quien creó la versión puede enviarla', async () =>
      http().post(`/admin/tarifas/versiones/${id}/enviar-revision`).set(con(doble)).expect(403));
    it('no se puede publicar un borrador → 409', async () =>
      http().post(`/admin/tarifas/versiones/${id}/publicar`).set(con(aprobador)).expect(409));
    it('envía a revisión y ya no admite ediciones', async () => {
      await http().post(`/admin/tarifas/versiones/${id}/enviar-revision`).set(con(creador)).expect(200);
      await http().put(`/admin/tarifas/versiones/${id}/tarifas`).set(con(creador)).send({ filas: [{ plan: 'IG', region: 'LPZ', sexo: 'M', edad: 30, prima: 1 }] }).expect(409);
    });
    it('el aprobador ve qué cambió contra la vigente', async () => {
      const r = await http().get(`/admin/tarifas/versiones/${id}/comparacion`).set(con(aprobador)).expect(200);
      expect(r.body.contra).toBe('Tarifario 2026-05');
      const ig = r.body.resumen.find((x: any) => x.plan === 'IG' && x.region === 'LPZ' && x.sexo === 'M');
      expect(ig.cambiadas).toBe(2); // edad 30 (66→70) y edad 40 (→ N/A)
      expect(Number(ig.maxPct)).toBeCloseTo(((70 - 66) / 66) * 100, 1);
      expect(r.body.resumen.every((x: any) => x.plan === 'IG' || x.plan.startsWith('MB_'))).toBe(true);
    });
    it('devolver exige motivo y regresa a borrador', async () => {
      await http().post(`/admin/tarifas/versiones/${id}/devolver`).set(con(aprobador)).send({}).expect(400);
      await http().post(`/admin/tarifas/versiones/${id}/devolver`).set(con(aprobador)).send({ motivo: 'Falta respaldo' }).expect(200);
      await http().post(`/admin/tarifas/versiones/${id}/enviar-revision`).set(con(creador)).expect(200);
    });
    it('quien creó la versión no puede aprobarla aunque tenga el rol (separación de funciones)', async () => {
      const propia = (await http().post('/admin/tarifas/versiones').set(con(doble))
        .send({ nombre: `${nombre} doble`, vigenteDesde: '2027-09-01', respaldoDocumental: 'prueba', copiarDe: await vigenteId() }).expect(201)).body.id;
      await http().post(`/admin/tarifas/versiones/${propia}/enviar-revision`).set(con(doble)).expect(200);
      await http().post(`/admin/tarifas/versiones/${propia}/publicar`).set(con(doble)).expect(403);
    });
    it('el aprobador publica: queda aprobada, y la anterior termina donde empieza la nueva', async () => {
      await http().post(`/admin/tarifas/versiones/${id}/publicar`).set(con(aprobador)).expect(200);
      const v = await pool.query(`SELECT estado, to_char(vigente_hasta,'YYYY-MM-DD') hasta FROM version_tarifa WHERE nombre IN ('Tarifario 2026-05', $1) ORDER BY vigente_desde`, [nombre]);
      expect(v.rows).toEqual([{ estado: 'PUBLICADA', hasta: FUTURO }, { estado: 'PUBLICADA', hasta: null }]);
    });
    it('hoy se sigue cotizando con la anterior; desde la fecha nueva, con la nueva', async () => {
      const svc = app.get(TarifasService, { strict: false });
      const hoy = await svc.cargar();
      expect(hoy.versionNombre).toBe('Tarifario 2026-05');
      expect(hoy.paquete.igr.LPZ.IG.M[30]).toBe(66);
      const futuro = await svc.cargar(undefined, FUTURO);
      expect(futuro.versionNombre).toBe(nombre);
      expect(futuro.paquete.igr.LPZ.IG.M[30]).toBe(70);
      expect(futuro.paquete.igr.LPZ.IG.M[40]).toBeNull();
      expect(futuro.paquete.mbHijo['1MM_5K']![2]).toBe(40);
    });
    it('una versión publicada ya no se puede devolver ni volver a publicar → 409', async () => {
      await http().post(`/admin/tarifas/versiones/${id}/devolver`).set(con(aprobador)).send({ motivo: 'arrepentido' }).expect(409);
      await http().post(`/admin/tarifas/versiones/${id}/publicar`).set(con(aprobador)).expect(409);
    });
    it('todo el proceso quedó en la auditoría, en orden', async () => {
      const a = await pool.query(`SELECT accion FROM auditoria WHERE entidad_id = $1 ORDER BY id`, [id]);
      expect(a.rows.map((x) => x.accion)).toEqual([
        'VERSION_CREAR', 'TARIFAS_EDITAR', 'TARIFAS_EDITAR', 'TARIFAS_HIJO_EDITAR', 'VERSION_A_REVISION',
        'VERSION_DEVOLVER', 'VERSION_A_REVISION', 'VERSION_PUBLICAR',
      ]);
    });
  });

  describe('parámetros', () => {
    const sars = (extra: object = {}) => ({ clave: 'SARS_RECARGO', producto: 'IG', valor: 12, vigenteDesde: FUTURO, motivo: 'Ajuste comercial 2027', ...extra });

    it('lista los parámetros con su vigencia', async () => {
      const r = await http().get('/admin/parametros').set(con(creador)).expect(200);
      expect(r.body.find((p: any) => p.clave === 'SARS_RECARGO' && p.producto === 'IG').valor).toBe(10);
    });
    it('no se cambia el presente ni el pasado → 422', async () => {
      await http().post('/admin/parametros').set(con(creador)).send(sars({ vigenteDesde: '2026-01-01' })).expect(422);
    });
    it('un valor fuera de rango para su tipo → 422', async () => {
      await http().post('/admin/parametros').set(con(creador)).send({ clave: 'COMBINADA_INCLUYE_SARS', valor: 5, vigenteDesde: FUTURO, motivo: 'prueba de tipo' }).expect(422);
      await http().post('/admin/parametros').set(con(creador)).send(sars({ producto: 'MB', clave: 'CONTADO_FACTOR', valor: 0 })).expect(422);
    });
    it('un parámetro que no existe lo crea TI, no la pantalla → 404', async () =>
      http().post('/admin/parametros').set(con(creador)).send(sars({ clave: 'INVENTADO' })).expect(404));
    it('producto y plan a la vez → 400', async () =>
      http().post('/admin/parametros').set(con(creador)).send(sars({ plan: 'RM_700K' })).expect(400));
    it('cambia desde una fecha futura sin tocar lo vigente, y deja auditoría con el motivo', async () => {
      await http().post('/admin/parametros').set(con(creador)).send(sars()).expect(201);
      const svc = app.get(TarifasService, { strict: false });
      expect((await svc.cargar()).parametros.sars.IG).toBe(10);
      expect((await svc.cargar(undefined, FUTURO)).parametros.sars.IG).toBe(12);
      const a = await pool.query(`SELECT antes, despues FROM auditoria WHERE accion = 'PARAMETRO_CAMBIAR' AND entidad_id = 'SARS_RECARGO'`);
      expect(a.rows[0].antes.valor).toBe(10);
      expect(a.rows[0].despues.motivo).toBe('Ajuste comercial 2027');
    });
    it('el descuento de Red Max (por plan) se cambia igual', async () => {
      await http().post('/admin/parametros').set(con(creador)).send({ clave: 'RM_DESCUENTO', plan: 'RM_140K', valor: 30, vigenteDesde: FUTURO, motivo: 'Nuevo descuento' }).expect(201);
      const svc = app.get(TarifasService, { strict: false });
      expect((await svc.cargar(undefined, FUTURO)).parametros.rmDescuento.RM_140K).toBe(30);
      expect((await svc.cargar()).parametros.rmDescuento.RM_140K).toBe(28);
    });
    it('un segundo cambio para la misma fecha → 422', async () =>
      http().post('/admin/parametros').set(con(creador)).send(sars({ valor: 13 })).expect(422));
  });
});
