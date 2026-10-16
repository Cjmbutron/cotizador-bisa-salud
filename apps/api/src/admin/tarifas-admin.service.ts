import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioActual } from '../auth/auth.tipos';
import { Db } from '../db/db.service';
import { ParametroFaltanteError, TarifasService } from '../tarifas/tarifas.service';

export interface FilaTarifa { plan: string; region?: string; sexo?: string; edad: number; prima: number | null }
export interface FilaHijo { plan: string; numeroHijos: number; primaPorHijo: number }

/** Forma que debe tener una versión completa. Sale del Excel cargado: 5 regionales × 3 sexos × edades 0–99; MB 18–99; NP 0–64. */
const ESPERADO = {
  igrFilasPorPlan: 5 * 3 * 100,
  mbFilasPorPlan: 82,
  npFilasPorPlan: 65,
  mbPlanes: 18,
  npPlanes: 22,
  hijosPorPlan: 5,
};

const TIPOS_PARAM: Record<string, (v: number) => string | null> = {
  MONTO_FIJO: (v) => (v >= 0 ? null : 'debe ser mayor o igual a 0'),
  FACTOR: (v) => (v > 0 ? null : 'debe ser mayor a 0'),
  EDAD: (v) => (Number.isInteger(v) && v >= 0 && v <= 120 ? null : 'debe ser un entero entre 0 y 120'),
  DIAS: (v) => (Number.isInteger(v) && v >= 1 && v <= 60 ? null : 'debe ser un entero entre 1 y 60'),
  BOOLEANO: (v) => (v === 0 || v === 1 ? null : 'debe ser 0 o 1'),
};

@Injectable()
export class TarifasAdminService {
  constructor(private readonly db: Db, private readonly auditoria: AuditoriaService, private readonly tarifas: TarifasService) {}

  // ------------------------------------------------------------ versiones
  async listar() {
    const r = await this.db.query(
      `SELECT v.id, v.nombre, v.estado, to_char(v.vigente_desde,'YYYY-MM-DD') AS "vigenteDesde",
              to_char(v.vigente_hasta,'YYYY-MM-DD') AS "vigenteHasta", v.respaldo_documental AS "respaldoDocumental",
              uc.email AS "creadoPor", ua.email AS "aprobadoPor", v.creado_en AS "creadoEn", v.aprobado_en AS "aprobadoEn",
              (SELECT count(*)::int FROM tarifa t WHERE t.version_id = v.id) AS tarifas
         FROM version_tarifa v LEFT JOIN usuario uc ON uc.id = v.creado_por LEFT JOIN usuario ua ON ua.id = v.aprobado_por
        ORDER BY v.vigente_desde DESC, v.creado_en DESC`);
    return r.rows;
  }

  private async version(c: Pick<Db, 'query'>, id: string, bloquear = false) {
    const r = await c.query<{ id: string; nombre: string; estado: string; creado_por: string | null; desde: string }>(
      `SELECT id, nombre, estado, creado_por, to_char(vigente_desde,'YYYY-MM-DD') AS desde
         FROM version_tarifa WHERE id::text = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [id]);
    if (!r.rows[0]) throw new NotFoundException('Versión de tarifas no encontrada');
    return r.rows[0];
  }

  private soloBorrador(v: { estado: string }) {
    if (v.estado !== 'BORRADOR') throw new ConflictException(`La versión está ${v.estado}; solo un BORRADOR admite cambios`);
  }

  async crear(u: UsuarioActual, d: { nombre: string; vigenteDesde: string; respaldoDocumental: string; copiarDe?: string }, ip?: string) {
    return this.db.tx(async (c) => {
      const hoy = await this.tarifas.hoy(c);
      if (d.vigenteDesde <= hoy) throw new UnprocessableEntityException('La vigencia de una versión nueva debe ser posterior a hoy');
      const dup = await c.query('SELECT 1 FROM version_tarifa WHERE nombre = $1', [d.nombre]);
      if (dup.rowCount) throw new ConflictException('Ya existe una versión con ese nombre');
      if (d.copiarDe) await this.version(c, d.copiarDe);
      const r = await c.query<{ id: string }>(
        `INSERT INTO version_tarifa (nombre, vigente_desde, respaldo_documental, creado_por, estado)
         VALUES ($1,$2,$3,$4,'BORRADOR') RETURNING id`, [d.nombre, d.vigenteDesde, d.respaldoDocumental, u.id]);
      const id = r.rows[0]!.id;
      if (d.copiarDe) {
        await c.query(
          `INSERT INTO tarifa (version_id, plan_id, region_id, sexo, edad_desde, edad_hasta, prima, periodicidad, disponible)
           SELECT $1, plan_id, region_id, sexo, edad_desde, edad_hasta, prima, periodicidad, disponible FROM tarifa WHERE version_id = $2`, [id, d.copiarDe]);
        await c.query(
          `INSERT INTO tarifa_hijo (version_id, plan_id, numero_hijos, prima_por_hijo)
           SELECT $1, plan_id, numero_hijos, prima_por_hijo FROM tarifa_hijo WHERE version_id = $2`, [id, d.copiarDe]);
      }
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'VERSION_CREAR', entidad: 'version_tarifa', entidadId: id, despues: { nombre: d.nombre, vigenteDesde: d.vigenteDesde, copiarDe: d.copiarDe ?? null }, ip });
      return { id, nombre: d.nombre, estado: 'BORRADOR' };
    });
  }

  // ------------------------------------------------------------ edición del borrador
  async guardarTarifas(u: UsuarioActual, versionId: string, filas: FilaTarifa[], ip?: string) {
    return this.db.tx(async (c) => {
      const v = await this.version(c, versionId, true);
      this.soloBorrador(v);
      this.validarFilas(filas, await this.planes(c));
      const claves = new Set<string>();
      for (const f of filas) {
        const k = `${f.plan}|${f.region ?? ''}|${f.sexo ?? ''}|${f.edad}`;
        if (claves.has(k)) throw new UnprocessableEntityException(`Fila repetida: ${k}`);
        claves.add(k);
      }
      const col = (fn: (f: FilaTarifa) => unknown) => filas.map(fn);
      const base = [versionId, col((f) => f.plan), col((f) => f.region ?? null), col((f) => f.sexo ?? null), col((f) => f.edad), col((f) => f.prima)];
      const origen = `unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::numeric[]) AS x(plan, region, sexo, edad, prima)`;
      await c.query(
        `DELETE FROM tarifa t USING ${origen}, plan p
          WHERE t.version_id = $1 AND p.id = t.plan_id AND p.codigo = x.plan
            AND coalesce((SELECT codigo FROM region WHERE id = t.region_id),'') = coalesce(x.region,'')
            AND coalesce(t.sexo,'') = coalesce(x.sexo,'') AND t.edad_desde = x.edad AND t.edad_hasta = x.edad`, base);
      await c.query(
        `INSERT INTO tarifa (version_id, plan_id, region_id, sexo, edad_desde, edad_hasta, prima, periodicidad, disponible)
         SELECT $1, p.id, r.id, x.sexo, x.edad, x.edad, x.prima,
                CASE WHEN pr.codigo = 'NP' THEN 'ANUAL'::periodicidad ELSE 'MENSUAL'::periodicidad END, x.prima IS NOT NULL
           FROM ${origen} JOIN plan p ON p.codigo = x.plan JOIN producto pr ON pr.id = p.producto_id LEFT JOIN region r ON r.codigo = x.region`, base);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'TARIFAS_EDITAR', entidad: 'version_tarifa', entidadId: versionId, despues: { filas: filas.length }, ip });
      return { versionId, filasGuardadas: filas.length };
    });
  }

  async guardarHijos(u: UsuarioActual, versionId: string, filas: FilaHijo[], ip?: string) {
    return this.db.tx(async (c) => {
      const v = await this.version(c, versionId, true);
      this.soloBorrador(v);
      const planes = await this.planes(c);
      for (const f of filas) {
        if (planes.get(f.plan) !== 'MB') throw new UnprocessableEntityException(`Plan ${f.plan}: la tarifa por hijo aplica solo a Mundial Blue`);
      }
      for (const f of filas) {
        await c.query(
          `INSERT INTO tarifa_hijo (version_id, plan_id, numero_hijos, prima_por_hijo)
           VALUES ($1,(SELECT id FROM plan WHERE codigo = $2),$3,$4)
           ON CONFLICT (version_id, plan_id, numero_hijos) DO UPDATE SET prima_por_hijo = EXCLUDED.prima_por_hijo`,
          [versionId, f.plan, f.numeroHijos, f.primaPorHijo]);
      }
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'TARIFAS_HIJO_EDITAR', entidad: 'version_tarifa', entidadId: versionId, despues: { filas: filas.length }, ip });
      return { versionId, filasGuardadas: filas.length };
    });
  }

  private async planes(c: Pick<Db, 'query'>) {
    const r = await c.query<{ codigo: string; producto: string; base: boolean }>(
      `SELECT p.codigo, pr.codigo AS producto, p.plan_base_id IS NOT NULL AS base FROM plan p JOIN producto pr ON pr.id = p.producto_id WHERE p.activo`);
    const m = new Map<string, string>();
    for (const p of r.rows) m.set(p.codigo, p.base ? 'BASE' : p.producto);
    return m;
  }

  private validarFilas(filas: FilaTarifa[], planes: Map<string, string>) {
    for (const f of filas) {
      const prod = planes.get(f.plan);
      const err = (m: string) => { throw new UnprocessableEntityException(`Plan ${f.plan} edad ${f.edad}: ${m}`); };
      if (!prod) err('plan inexistente o inactivo');
      if (prod === 'BASE') err('los planes Red Max 140K y 70K no tienen tarifa propia: usan la de 700K');
      if (prod === 'IG' || prod === 'RM' || prod === 'AD') {
        if (!f.region || !f.sexo) err('requiere región y sexo');
      } else if (f.region || f.sexo) err('no admite región ni sexo');
      if (prod === 'MB' && f.edad < 18) err('Mundial Blue adulto empieza a los 18 años');
      if (prod === 'NP' && f.edad > 64) err('Naranja+ no cotiza sobre 64 años');
    }
  }

  // ------------------------------------------------------------ revisión y publicación
  /** Lista de problemas que impiden publicar. Vacía = la versión está completa. */
  async completitud(versionId: string, q: Pick<Db, 'query'> = this.db): Promise<string[]> {
    const p: string[] = [];
    const r = await q.query<{ producto: string; plan: string; n: number; periodicidades: string[] }>(
      `SELECT pr.codigo AS producto, pl.codigo AS plan, count(*)::int AS n, array_agg(DISTINCT t.periodicidad::text) AS periodicidades
         FROM tarifa t JOIN plan pl ON pl.id = t.plan_id JOIN producto pr ON pr.id = pl.producto_id WHERE t.version_id = $1 GROUP BY 1,2`, [versionId]);
    const por = new Map(r.rows.map((x) => [x.plan, x]));
    for (const plan of ['IG', 'RM_700K', 'AD']) {
      const n = por.get(plan)?.n ?? 0;
      if (n !== ESPERADO.igrFilasPorPlan) p.push(`${plan}: tiene ${n} tarifas y debe tener ${ESPERADO.igrFilasPorPlan} (5 regionales × 3 sexos × edades 0–99)`);
    }
    const cuenta = (prod: string) => r.rows.filter((x) => x.producto === prod);
    const mb = cuenta('MB'); const np = cuenta('NP');
    if (mb.length !== ESPERADO.mbPlanes) p.push(`Mundial Blue: hay tarifas para ${mb.length} planes y deben ser ${ESPERADO.mbPlanes}`);
    for (const x of mb) if (x.n !== ESPERADO.mbFilasPorPlan) p.push(`${x.plan}: tiene ${x.n} edades y debe tener ${ESPERADO.mbFilasPorPlan} (18–99)`);
    if (np.length !== ESPERADO.npPlanes) p.push(`Naranja+: hay tarifas para ${np.length} planes y deben ser ${ESPERADO.npPlanes}`);
    for (const x of np) if (x.n !== ESPERADO.npFilasPorPlan) p.push(`${x.plan}: tiene ${x.n} edades y debe tener ${ESPERADO.npFilasPorPlan} (0–64)`);
    const h = await q.query<{ plan: string; n: number }>(
      `SELECT pl.codigo AS plan, count(*)::int AS n FROM tarifa_hijo h JOIN plan pl ON pl.id = h.plan_id WHERE h.version_id = $1 GROUP BY 1`, [versionId]);
    const hijos = new Map(h.rows.map((x) => [x.plan, x.n]));
    for (const x of mb) if ((hijos.get(x.plan) ?? 0) !== ESPERADO.hijosPorPlan) p.push(`${x.plan}: tarifa por hijo con ${hijos.get(x.plan) ?? 0} de ${ESPERADO.hijosPorPlan} cantidades de hijos`);
    return p;
  }

  async revision(versionId: string) {
    await this.version(this.db, versionId);
    return { problemas: await this.completitud(versionId) };
  }

  /** Para el aprobador: qué cambió respecto de otra versión (por defecto la vigente). */
  async comparar(versionId: string, conId?: string) {
    await this.version(this.db, versionId);
    let base = conId;
    if (!base) {
      const v = await this.db.query<{ id: string }>(`SELECT id FROM version_tarifa WHERE estado = 'PUBLICADA' AND vigente_desde <= current_date AND (vigente_hasta IS NULL OR vigente_hasta > current_date)`);
      base = v.rows[0]?.id;
    }
    if (!base) return { contra: null, resumen: [] };
    const bv = await this.version(this.db, base);
    const r = await this.db.query(
      `WITH a AS (SELECT plan_id, region_id, sexo, edad_desde, prima FROM tarifa WHERE version_id = $1),
            b AS (SELECT plan_id, region_id, sexo, edad_desde, prima FROM tarifa WHERE version_id = $2),
            j AS (SELECT coalesce(a.plan_id, b.plan_id) AS plan_id, coalesce(a.region_id, b.region_id) AS region_id,
                         coalesce(a.sexo, b.sexo) AS sexo, a.prima AS nueva, b.prima AS anterior,
                         (a.plan_id IS NULL) AS eliminada, (b.plan_id IS NULL) AS agregada
                    FROM a FULL JOIN b ON a.plan_id = b.plan_id AND a.region_id IS NOT DISTINCT FROM b.region_id
                                      AND a.sexo IS NOT DISTINCT FROM b.sexo AND a.edad_desde = b.edad_desde)
       SELECT pl.codigo AS plan, r.codigo AS region, j.sexo,
              count(*) FILTER (WHERE NOT eliminada AND NOT agregada AND nueva IS DISTINCT FROM anterior)::int AS cambiadas,
              count(*) FILTER (WHERE agregada)::int AS agregadas, count(*) FILTER (WHERE eliminada)::int AS eliminadas,
              round(min((nueva - anterior) / nullif(anterior,0) * 100) FILTER (WHERE nueva IS DISTINCT FROM anterior AND anterior > 0), 2) AS "minPct",
              round(max((nueva - anterior) / nullif(anterior,0) * 100) FILTER (WHERE nueva IS DISTINCT FROM anterior AND anterior > 0), 2) AS "maxPct"
         FROM j JOIN plan pl ON pl.id = j.plan_id LEFT JOIN region r ON r.id = j.region_id
        GROUP BY 1,2,3 HAVING count(*) FILTER (WHERE agregada OR eliminada OR nueva IS DISTINCT FROM anterior) > 0 ORDER BY 1,2,3`, [versionId, base]);
    return { contra: bv.nombre, resumen: r.rows };
  }

  async enviarRevision(u: UsuarioActual, versionId: string, ip?: string) {
    return this.db.tx(async (c) => {
      const v = await this.version(c, versionId, true);
      this.soloBorrador(v);
      if (v.creado_por !== u.id) throw new ForbiddenException('Solo quien creó la versión puede enviarla a revisión');
      const problemas = await this.completitud(versionId, c);
      if (problemas.length) throw new UnprocessableEntityException({ mensaje: 'La versión está incompleta', problemas });
      await c.query(`UPDATE version_tarifa SET estado = 'EN_REVISION' WHERE id = $1`, [versionId]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'VERSION_A_REVISION', entidad: 'version_tarifa', entidadId: versionId, antes: { estado: 'BORRADOR' }, despues: { estado: 'EN_REVISION' }, ip });
      return { id: versionId, estado: 'EN_REVISION' };
    });
  }

  async devolver(u: UsuarioActual, versionId: string, motivo: string, ip?: string) {
    return this.db.tx(async (c) => {
      const v = await this.version(c, versionId, true);
      if (v.estado !== 'EN_REVISION') throw new ConflictException(`La versión está ${v.estado}; solo una EN_REVISION puede devolverse`);
      await c.query(`UPDATE version_tarifa SET estado = 'BORRADOR' WHERE id = $1`, [versionId]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'VERSION_DEVOLVER', entidad: 'version_tarifa', entidadId: versionId, antes: { estado: 'EN_REVISION' }, despues: { estado: 'BORRADOR', motivo }, ip });
      return { id: versionId, estado: 'BORRADOR' };
    });
  }

  async publicar(u: UsuarioActual, versionId: string, ip?: string) {
    return this.db.tx(async (c) => {
      const v = await this.version(c, versionId, true);
      if (v.estado !== 'EN_REVISION') throw new ConflictException(`La versión está ${v.estado}; debe estar EN_REVISION para publicarse`);
      if (v.creado_por === u.id) throw new ForbiddenException('Quien creó la versión no puede aprobarla');
      const hoy = await this.tarifas.hoy(c);
      if (v.desde <= hoy) throw new UnprocessableEntityException('La vigencia de la versión ya empezó; debe corregirse antes de publicar');
      const problemas = await this.completitud(versionId, c);
      if (problemas.length) throw new UnprocessableEntityException({ mensaje: 'La versión está incompleta', problemas });
      // La versión publicada anterior que siga abierta termina donde empieza la nueva.
      const prev = await c.query<{ id: string; desde: string }>(
        `SELECT id, to_char(vigente_desde,'YYYY-MM-DD') AS desde FROM version_tarifa
          WHERE estado = 'PUBLICADA' AND id <> $1 AND (vigente_hasta IS NULL OR vigente_hasta > $2::date) FOR UPDATE`, [versionId, v.desde]);
      for (const p of prev.rows) {
        if (p.desde >= v.desde) throw new ConflictException(`Ya hay una versión publicada que empieza el ${p.desde}, no antes que esta`);
        await c.query('UPDATE version_tarifa SET vigente_hasta = $2 WHERE id = $1', [p.id, v.desde]);
      }
      await c.query(`UPDATE version_tarifa SET estado = 'PUBLICADA', aprobado_por = $2, aprobado_en = now() WHERE id = $1`, [versionId, u.id]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'VERSION_PUBLICAR', entidad: 'version_tarifa', entidadId: versionId, antes: { estado: 'EN_REVISION' }, despues: { estado: 'PUBLICADA', vigenteDesde: v.desde, cierra: prev.rows.map((p) => p.id) }, ip });
      return { id: versionId, estado: 'PUBLICADA', vigenteDesde: v.desde };
    });
  }

  // ------------------------------------------------------------ parámetros
  async listarParametros() {
    const r = await this.db.query(
      `SELECT pa.clave, pr.codigo AS producto, pl.codigo AS plan, pa.valor::float8 AS valor, pa.tipo, pa.descripcion,
              to_char(pa.vigente_desde,'YYYY-MM-DD') AS "vigenteDesde", to_char(pa.vigente_hasta,'YYYY-MM-DD') AS "vigenteHasta"
         FROM parametro pa LEFT JOIN producto pr ON pr.id = pa.producto_id LEFT JOIN plan pl ON pl.id = pa.plan_id
        ORDER BY pa.clave, pr.codigo NULLS FIRST, pl.codigo NULLS FIRST, pa.vigente_desde DESC`);
    return r.rows;
  }

  /**
   * Cambia el valor de un parámetro a partir de una fecha FUTURA: cierra el valor vigente y abre el nuevo.
   * Nunca se reescribe el pasado (las cotizaciones guardan los valores que usaron, pero el historial debe ser fiel).
   * REQUIERE VALIDACIÓN DEL NEGOCIO: hoy lo hace un solo usuario con rol de tarifas; evaluar si exige doble aprobación.
   */
  async cambiarParametro(u: UsuarioActual, d: { clave: string; producto?: string; plan?: string; valor: number; vigenteDesde: string; motivo: string }, ip?: string) {
    if (d.producto && d.plan) throw new BadRequestException('Indique producto o plan, no ambos');
    return this.db.tx(async (c) => {
      const hoy = await this.tarifas.hoy(c);
      if (d.vigenteDesde <= hoy) throw new UnprocessableEntityException('La nueva vigencia debe ser posterior a hoy; no se modifica el pasado ni el presente');
      const act = await c.query<{ id: string; tipo: string; valor: string; desde: string }>(
        `SELECT pa.id, pa.tipo, pa.valor, to_char(pa.vigente_desde,'YYYY-MM-DD') AS desde
           FROM parametro pa LEFT JOIN producto pr ON pr.id = pa.producto_id LEFT JOIN plan pl ON pl.id = pa.plan_id
          WHERE pa.clave = $1 AND coalesce(pr.codigo,'') = coalesce($2,'') AND coalesce(pl.codigo,'') = coalesce($3,'')
            AND pa.vigente_hasta IS NULL ORDER BY pa.vigente_desde DESC LIMIT 1 FOR UPDATE OF pa`, [d.clave, d.producto ?? null, d.plan ?? null]);
      const p = act.rows[0];
      if (!p) throw new NotFoundException('No existe un parámetro vigente con esa clave; los parámetros nuevos los crea TI');
      const falla = TIPOS_PARAM[p.tipo]?.(d.valor);
      if (falla) throw new UnprocessableEntityException(`Valor inválido para un parámetro ${p.tipo}: ${falla}`);
      if (p.desde >= d.vigenteDesde) throw new UnprocessableEntityException(`Ya hay un valor que empieza el ${p.desde}`);
      await c.query('UPDATE parametro SET vigente_hasta = $2 WHERE id = $1', [p.id, d.vigenteDesde]);
      await c.query(
        `INSERT INTO parametro (clave, producto_id, plan_id, valor, tipo, descripcion, vigente_desde, creado_por)
         SELECT clave, producto_id, plan_id, $2, tipo, descripcion, $3::date, $4 FROM parametro WHERE id = $1`, [p.id, d.valor, d.vigenteDesde, u.id]);
      // El motor debe poder cargar el conjunto completo con el cambio: si no, se revierte todo.
      try { await this.tarifas.cargarParametros(c as PoolClient, d.vigenteDesde); }
      catch (e) {
        if (e instanceof ParametroFaltanteError) throw new UnprocessableEntityException(`El cambio deja la configuración inconsistente: ${e.message}`);
        throw e;
      }
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'PARAMETRO_CAMBIAR', entidad: 'parametro', entidadId: d.clave, antes: { valor: Number(p.valor) }, despues: { valor: d.valor, desde: d.vigenteDesde, producto: d.producto, plan: d.plan, motivo: d.motivo }, ip });
      return { clave: d.clave, valor: d.valor, vigenteDesde: d.vigenteDesde };
    });
  }
}
