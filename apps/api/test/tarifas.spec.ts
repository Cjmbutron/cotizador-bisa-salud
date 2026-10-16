import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PARAMETROS_INICIALES } from '@bisa/motor-precios';
import { Pool } from 'pg';
import { Db } from '../src/db/db.service';
import { TarifasService } from '../src/tarifas/tarifas.service';
import { configPrueba, sembrar } from './ayudas';

const FIXTURES = join(__dirname, '../../../packages/motor-precios/fixtures');
const recortar = (a: Array<number | null>) => { const r = [...a]; while (r.length && r[r.length - 1] === null) r.pop(); return r; };
/** Compara a 6 decimales: tarifa_hijo guarda numeric(14,6) y el Excel guarda el cociente completo. */
const normalizar = (o: any): any =>
  Array.isArray(o) ? recortar(o.map(normalizar)) :
  o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, normalizar(v)])) :
  typeof o === 'number' ? Math.round(o * 1e6) / 1e6 : o;

describe('Carga de tarifas y parámetros desde PostgreSQL', () => {
  let db: Db; let svc: TarifasService; let pool: Pool;
  beforeAll(async () => {
    db = new Db(configPrueba()); pool = db.pool; svc = new TarifasService(db);
    await sembrar(pool);
  });
  afterAll(() => db.onModuleDestroy());

  it('el paquete armado desde la base es idéntico al que usó la conciliación contra el Excel', async () => {
    const ctx = await svc.cargar(db);
    const esperado = JSON.parse(readFileSync(join(FIXTURES, 'tarifas.json'), 'utf8'));
    expect(ctx.versionNombre).toBe('Tarifario 2026-05');
    expect(normalizar(ctx.paquete)).toEqual(normalizar(esperado));
  });

  it('tarifas por hijo: el redondeo a 6 decimales no cambia el entero superior que usa el motor', async () => {
    const ctx = await svc.cargar(db);
    const esperado = JSON.parse(readFileSync(join(FIXTURES, 'tarifas.json'), 'utf8'));
    let n = 0;
    for (const [clave, arr] of Object.entries<Array<number | null>>(esperado.mbHijo)) {
      arr.forEach((v, i) => {
        if (v === null) return;
        n++;
        expect(Math.ceil(ctx.paquete.mbHijo[clave]![i]!)).toBe(Math.ceil(v));
      });
    }
    expect(n).toBe(90);
  });

  it('los parámetros vigentes de la base equivalen a los valores iniciales del motor', async () => {
    const ctx = await svc.cargar(db);
    expect(ctx.parametros).toEqual(PARAMETROS_INICIALES);
    expect(ctx.validezDiasHabiles).toBe(10);
  });

  it('antes de la vigencia no hay tarifas: error claro', async () => {
    await expect(svc.cargar(db, '2026-04-30')).rejects.toThrow(/No hay una versión de tarifas/);
  });

  it('un parámetro vencido o faltante impide calcular', async () => {
    await expect(svc.cargarParametros(db, '2026-04-30')).rejects.toThrow(/Parámetro vigente no configurado/);
  });
});
