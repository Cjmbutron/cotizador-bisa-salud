import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { Db } from '../src/db/db.service';
import { USUARIOS, URL_DB, entradaBase, iniciarApp, sembrar, token } from './ayudas';

const golden = JSON.parse(readFileSync(join(__dirname, '../../../packages/motor-precios/fixtures/golden.json'), 'utf8'));

describe('API de cotizaciones (PostgreSQL real)', () => {
  let app: INestApplication; let pool: Pool;
  let ana = ''; let beto = ''; let sup = ''; let aud = '';
  const http = () => request(app.getHttpServer());
  const con = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_DB });
    await sembrar(pool);
    app = await iniciarApp();
    ana = await token(USUARIOS.ana.email); beto = await token(USUARIOS.beto.email);
    sup = await token(USUARIOS.sup.email); aud = await token(USUARIOS.aud.email);
  });
  afterAll(async () => { await app.close(); await pool.end(); });

  // ------------------------------------------------------------------ seguridad
  describe('autenticación y autorización', () => {
    it('/health es público', async () => {
      const r = await http().get('/health').expect(200);
      expect(r.body).toEqual({ estado: 'ok' });
    });
    it('sin token → 401', () => http().get('/cotizaciones').expect(401));
    it('token firmado con otro secreto → 401', async () =>
      http().get('/cotizaciones').set(con(await token(USUARIOS.ana.email, { secreto: 'otro-secreto-otro-secreto-otro-secreto-123' }))).expect(401));
    it('token con emisor distinto → 401', async () =>
      http().get('/cotizaciones').set(con(await token(USUARIOS.ana.email, { issuer: 'otro' }))).expect(401));
    it('token vencido → 401', async () =>
      http().get('/cotizaciones').set(con(await token(USUARIOS.ana.email, { exp: '-1m' }))).expect(401));
    it('usuario no registrado → 403 y queda en auditoría', async () => {
      await http().get('/cotizaciones').set(con(await token('desconocido@bisa.test'))).expect(403);
      const a = await pool.query(`SELECT count(*)::int n FROM auditoria WHERE accion='ACCESO_DENEGADO'`);
      expect(a.rows[0].n).toBeGreaterThan(0);
    });
    it('usuario inactivo → 403', async () =>
      http().get('/cotizaciones').set(con(await token(USUARIOS.inactivo.email))).expect(403));
    it('usuario sin roles no puede operar → 403', async () =>
      http().get('/cotizaciones').set(con(await token(USUARIOS.sinrol.email))).expect(403));
    it('auditor no puede guardar → 403', () =>
      http().post('/cotizaciones').set(con(aud)).send({ titularNombre: 'X', entrada: entradaBase() }).expect(403));
    it('/me devuelve los roles del usuario autenticado', async () => {
      const r = await http().get('/me').set(con(sup)).expect(200);
      expect(r.body).toEqual({ email: USUARIOS.sup.email, nombre: 'sup', roles: ['SUPERVISOR'] });
      await http().get('/me').expect(401);
    });
    it('el catálogo requiere autenticación', () => http().get('/catalogo').expect(401));
  });

  // ------------------------------------------------------------------ cálculo
  describe('POST /cotizaciones/calcular', () => {
    it('devuelve el resultado, la versión de tarifas y no guarda nada', async () => {
      const antes = (await pool.query('SELECT count(*)::int n FROM cotizacion')).rows[0].n;
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(entradaBase()).expect(200);
      expect(r.body.versionTarifa).toBe('Tarifario 2026-05');
      expect(r.body.resultado.lineas).toHaveLength(4);
      expect(r.body.resultado.totales.map((t: any) => t.producto).sort()).toEqual(['AD', 'IG']);
      expect((await pool.query('SELECT count(*)::int n FROM cotizacion')).rows[0].n).toBe(antes);
    });

    it('los importes viajan como texto decimal, no como números flotantes', async () => {
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(entradaBase()).expect(200);
      expect(typeof r.body.resultado.lineas[0].primaMensual).toBe('string');
    });

    // El corazón de la migración: lo que sale de la API (tarifas leídas de PostgreSQL) coincide con el Excel.
    for (const c of golden as any[]) {
      it(`caso del Excel ${c.nombre}: coincide línea por línea y en totales`, async () => {
        const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(c.entrada).expect(200);
        const lineas = r.body.resultado.lineas;
        for (const p of c.personas) {
          for (const prod of c.entrada.productos) {
            const l = lineas.find((x: any) => x.aseguradoIdx === p.idx && x.producto === prod);
            const esp = p.esperado[prod];
            if (esp === 'N/A') expect(l.estado).not.toBe('OK');
            else expect(Number(l.primaMensual)).toBe(esp);
          }
        }
        for (const prod of c.entrada.productos) {
          const t = r.body.resultado.totales.find((x: any) => x.producto === prod);
          expect([Number(t.mensual), Number(t.anual), Number(t.contado)]).toEqual([c.totales[prod].mensual, c.totales[prod].anual, c.totales[prod].contado]);
        }
      });
    }

    it('datos inválidos de negocio → 422 con códigos V0x', async () => {
      const e = entradaBase(); e.asegurados[0]!.edad = 150;
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(e).expect(422);
      expect(r.body.errores[0].codigo).toMatch(/^V0\d$/);
    });
    it('forma inválida → 400 con el campo', async () => {
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send({ ...entradaBase(), regional: 'XXX' }).expect(400);
      expect(r.body.detalle[0].campo).toBe('regional');
    });
    it('campos desconocidos se rechazan → 400', () =>
      http().post('/cotizaciones/calcular').set(con(ana)).send({ ...entradaBase(), descuentoEspecial: 50 }).expect(400));
    it('cuerpo demasiado grande → 413', () =>
      http().post('/cotizaciones/calcular').set(con(ana)).send({ x: 'a'.repeat(200_000) }).expect(413));
    it('avisa cuando la suma combinada mezcla monedas', async () => {
      const e = { ...entradaBase(), productos: ['IG', 'AD'], asegurados: entradaBase().asegurados.map((a) => ({ ...a, productoElegido: 'IG' })) };
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(e).expect(200);
      if (r.body.resultado.combinada) expect(r.body.advertencias[0]).toMatch(/COMBINADA_MEZCLA_MONEDAS/);
    });
  });

  // ------------------------------------------------------------------ guardar / consultar / ciclo de vida
  describe('guardar, consultar, emitir, anular', () => {
    let id: string; let numero: string;

    it('guarda con número, vigencia y versión de tarifas', async () => {
      const r = await http().post('/cotizaciones').set(con(ana)).send({ titularNombre: 'Juan Pérez', entrada: entradaBase() }).expect(201);
      id = r.body.id; numero = r.body.numero;
      expect(numero).toMatch(/^COT-\d{4}-\d{6}$/);
      expect(r.body.estado).toBe('CALCULADA');
      expect(r.body.validaHasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('lo guardado se puede leer completo y coincide con lo calculado', async () => {
      const calc = await http().post('/cotizaciones/calcular').set(con(ana)).send(entradaBase()).expect(200);
      const r = await http().get(`/cotizaciones/${id}`).set(con(ana)).expect(200);
      expect(r.body.asegurados).toHaveLength(2);
      expect(r.body.lineas).toHaveLength(4);
      const guardado = Object.fromEntries(r.body.totales.map((t: any) => [t.producto, [Number(t.mensual), Number(t.anual), Number(t.contado)]]));
      const calculado = Object.fromEntries(calc.body.resultado.totales.map((t: any) => [t.producto, [Number(t.mensual), Number(t.anual), Number(t.contado)]]));
      expect(guardado).toEqual(calculado);
      expect(r.body.versionTarifa).toBe('Tarifario 2026-05');
      expect(r.body.parametrosUsados.SARS_RECARGO).toBeUndefined(); // se guardan con clave por producto
      expect(r.body.parametrosUsados['SARS_RECARGO:IG']).toBe(10);
    });

    it('otro comercial no la ve (404, no 403: no revela que existe)', () =>
      http().get(`/cotizaciones/${id}`).set(con(beto)).expect(404));
    it('supervisor y auditor sí la ven', async () => {
      await http().get(`/cotizaciones/${id}`).set(con(sup)).expect(200);
      await http().get(`/cotizaciones/${id}`).set(con(aud)).expect(200);
    });
    it('un id mal formado → 404, no 500', () => http().get('/cotizaciones/no-es-uuid').set(con(ana)).expect(404));

    it('el listado de un comercial solo incluye lo suyo; el del supervisor incluye todo', async () => {
      await http().post('/cotizaciones').set(con(beto)).send({ titularNombre: 'María Gómez', entrada: entradaBase() }).expect(201);
      const a = await http().get('/cotizaciones').set(con(ana)).expect(200);
      expect(a.body.items.every((x: any) => x.creadaPor === USUARIOS.ana.email)).toBe(true);
      const s = await http().get('/cotizaciones').set(con(sup)).expect(200);
      expect(new Set(s.body.items.map((x: any) => x.creadaPor)).size).toBeGreaterThan(1);
    });
    it('búsqueda por titular o por número', async () => {
      const porNombre = await http().get('/cotizaciones').query({ q: 'juan' }).set(con(ana)).expect(200);
      expect(porNombre.body.items.map((x: any) => x.numero)).toContain(numero);
      const porNumero = await http().get('/cotizaciones').query({ q: numero }).set(con(ana)).expect(200);
      expect(porNumero.body.total).toBe(1);
    });
    it('un filtro con texto malicioso no rompe nada (consulta parametrizada)', async () => {
      const r = await http().get('/cotizaciones').query({ q: "'; DROP TABLE cotizacion; --" }).set(con(ana)).expect(200);
      expect(r.body.total).toBe(0);
    });

    it('otro comercial no puede emitirla ni anularla', async () => {
      await http().post(`/cotizaciones/${id}/emitir`).set(con(beto)).expect(404);
      await http().post(`/cotizaciones/${id}/anular`).set(con(beto)).send({ motivo: 'no me corresponde' }).expect(404);
    });

    it('emitir cambia el estado y deja auditoría', async () => {
      const r = await http().post(`/cotizaciones/${id}/emitir`).set(con(ana)).expect(200);
      expect(r.body.estado).toBe('EMITIDA');
      const a = await pool.query(`SELECT accion FROM auditoria WHERE entidad_id = $1 ORDER BY id`, [id]);
      expect(a.rows.map((x) => x.accion)).toEqual(['COTIZACION_CREAR', 'COTIZACION_EMITIR']);
    });
    it('emitir dos veces → 409', () => http().post(`/cotizaciones/${id}/emitir`).set(con(ana)).expect(409));

    it('una cotización emitida no admite cambios en sus resultados (la base lo impide)', async () => {
      await expect(pool.query(`UPDATE cotizacion_total SET mensual = 1 WHERE cotizacion_id = $1`, [id])).rejects.toThrow(/EMITIDA/);
      await expect(pool.query(`UPDATE cotizacion SET entrada = '{}' WHERE id = $1`, [id])).rejects.toThrow(/emitida/i);
    });

    it('anular exige motivo', () => http().post(`/cotizaciones/${id}/anular`).set(con(ana)).send({}).expect(400));
    it('el supervisor puede anular una emitida, con motivo, y queda registrado', async () => {
      await http().post(`/cotizaciones/${id}/anular`).set(con(sup)).send({ motivo: 'Error en la edad del titular' }).expect(200);
      const a = await pool.query(`SELECT despues FROM auditoria WHERE entidad_id = $1 AND accion = 'COTIZACION_ANULAR'`, [id]);
      expect(a.rows[0].despues.motivo).toBe('Error en la edad del titular');
    });
    it('una anulada no se puede volver a anular ni emitir', async () => {
      await http().post(`/cotizaciones/${id}/anular`).set(con(sup)).send({ motivo: 'otra vez' }).expect(409);
      await http().post(`/cotizaciones/${id}/emitir`).set(con(ana)).expect(409);
    });

    it('una cotización vencida no se puede emitir', async () => {
      const r = await http().post('/cotizaciones').set(con(ana)).send({ titularNombre: 'Vencida', entrada: entradaBase() }).expect(201);
      await pool.query(`UPDATE cotizacion SET valida_hasta = current_date - 1 WHERE id = $1`, [r.body.id]);
      await http().post(`/cotizaciones/${r.body.id}/emitir`).set(con(ana)).expect(409);
    });

    it('la auditoría no se puede modificar ni borrar', async () => {
      await expect(pool.query(`DELETE FROM auditoria`)).rejects.toThrow(/solo inserción/);
      await expect(pool.query(`UPDATE auditoria SET accion = 'X'`)).rejects.toThrow(/solo inserción/);
    });
  });

  // ------------------------------------------------------------------ catálogo
  it('catálogo con regionales, productos, planes y parentescos', async () => {
    const r = await http().get('/catalogo').set(con(ana)).expect(200);
    expect(r.body.regiones.map((x: any) => x.codigo)).toEqual(['LPZ', 'CBBA', 'SCZ', 'CHQ', 'TJA']);
    expect(r.body.productos.find((p: any) => p.codigo === 'RM').moneda).toBe('BOB');
    expect(r.body.parentescos).toHaveLength(3);
    expect(r.body.planes.length).toBeGreaterThan(40);
  });

  // ------------------------------------------------------------------ errores
  it('un error interno no filtra detalles al cliente (500 genérico)', async () => {
    const db = app.get(Db);
    const original = db.query.bind(db);
    jest.spyOn(db, 'query').mockImplementation(((sql: string, p?: unknown[]) =>
      /FROM region/.test(sql) ? Promise.reject(new Error('relation "region" detalle secreto')) : original(sql, p)) as any);
    try {
      const r = await http().get('/catalogo').set(con(ana)).expect(500);
      expect(r.body).toEqual({ mensaje: 'Error interno del servidor' });
    } finally { jest.restoreAllMocks(); }
  });

  // ------------------------------------------------------------------ limitación de tasa
  it('limita las peticiones por minuto (429)', async () => {
    const limitada = await iniciarApp({ RATE_LIMIT_POR_MINUTO: '3' });
    try {
      const codigos: number[] = [];
      for (let i = 0; i < 5; i++) codigos.push((await request(limitada.getHttpServer()).get('/health')).status);
      expect(codigos).toEqual([200, 200, 200, 429, 429]);
    } finally { await limitada.close(); }
  });

  // ------------------------------------------------------------------ sin tarifas vigentes (al final: archiva la versión)
  it('sin versión de tarifas vigente: 503 claro, no un error genérico', async () => {
    const previo = (await pool.query(`SELECT vigente_hasta FROM version_tarifa WHERE nombre = 'Tarifario 2026-05'`)).rows[0].vigente_hasta;
    await pool.query(`UPDATE version_tarifa SET vigente_hasta = current_date WHERE nombre = 'Tarifario 2026-05'`);
    try {
      const r = await http().post('/cotizaciones/calcular').set(con(ana)).send(entradaBase()).expect(503);
      expect(r.body.codigo).toBe('CONFIGURACION_INCOMPLETA');
    } finally {
      await pool.query(`UPDATE version_tarifa SET vigente_hasta = $1 WHERE nombre = 'Tarifario 2026-05'`, [previo]);
    }
  });
});
